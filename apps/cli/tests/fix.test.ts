import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '@orchentra/cli-api'
import { fix } from '../src/commands/fix'
import type { GitOps } from '../src/commands/git-ops'
import type { LiveCli } from '../src/live-cli'

interface MockCall {
  readonly method: string
  readonly url: string
  readonly body?: unknown
}

function mockCli(): LiveCli {
  return { runTurn: async (): Promise<void> => undefined } as unknown as LiveCli
}

function mockGit(opts: { beforeFiles?: string[]; afterFiles?: string[]; diff?: string }): {
  git: GitOps
  calls: string[]
} {
  const calls: string[] = []
  let statusCallCount = 0
  const git: GitOps = {
    currentBranch: (): string => 'main',
    checkout: (branch, base): void => {
      calls.push(`checkout:${branch}:${base ?? ''}`)
    },
    hasUncommittedChanges: (): boolean => {
      const files = statusCallCount === 0 ? (opts.beforeFiles ?? []) : (opts.afterFiles ?? [])
      return files.length > 0
    },
    listUncommittedFiles: (): string[] => {
      const files = statusCallCount === 0 ? (opts.beforeFiles ?? []) : (opts.afterFiles ?? [])
      statusCallCount++
      return [...files]
    },
    diffFiles: (paths): string => {
      calls.push(`diff:${paths.join(',')}`)
      return opts.diff ?? `+ noop change in ${paths.join(', ')}\n`
    },
    add: (paths): void => {
      calls.push(`add:${paths.join(',')}`)
    },
    commit: (message): void => {
      calls.push(`commit:${message.split('\n')[0]}`)
    },
    push: (branch): void => {
      calls.push(`push:${branch}`)
    },
    resetHard: (ref): void => {
      calls.push(`reset:${ref}`)
    },
  }
  return { git, calls }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function routeFixFetch(opts: { existingPulls: unknown[]; captured: MockCall[] }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    opts.captured.push({ method, url, body })

    if (url.endsWith('/actions/runs/42')) {
      return jsonResponse({
        id: 42,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'sha-head',
        event: 'push',
        status: 'completed',
        conclusion: 'failure',
        html_url: 'https://github.com/o/r/actions/runs/42',
        workflow_id: 1,
      })
    }
    if (url.includes('/actions/runs/42/jobs')) {
      return jsonResponse({
        jobs: [
          {
            id: 100,
            run_id: 42,
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            html_url: 'https://github.com/o/r/jobs/100',
            steps: [{ name: 'run', status: 'completed', conclusion: 'failure', number: 1 }],
          },
        ],
      })
    }
    if (url.includes('/actions/jobs/100/logs')) return new Response('##[error] boom', { status: 200 })
    if (url.includes('/pulls') && method === 'GET') return jsonResponse(opts.existingPulls)
    if (url.includes('/pulls') && method === 'POST') {
      return jsonResponse(
        {
          number: 77,
          title: body.title,
          state: 'open',
          html_url: 'https://github.com/o/r/pull/77',
          head: { ref: body.head, sha: 'sha-head' },
          base: { ref: body.base, sha: 'sha-base' },
        },
        201,
      )
    }
    if (url.match(/\/pulls\/\d+$/) && method === 'PATCH') {
      const number = Number(url.split('/').pop())
      return jsonResponse({
        number,
        title: body.title,
        state: 'open',
        html_url: `https://github.com/o/r/pull/${number}`,
        head: { ref: 'orchentra/fix/run-42', sha: 'sha-head' },
        base: { ref: 'main', sha: 'sha-base' },
      })
    }
    return new Response('no route', { status: 404 })
  }) as typeof fetch
}

describe('fix', () => {
  test('opens a new PR when agent produces file changes and none exists', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    process.env.ORCHENTRA_ALLOWED_ORGS = ''

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ existingPulls: [], captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.createdPullRequest).toBe(true)
    expect(result.changedFiles).toBe(true)
    expect(result.pullRequest?.number).toBe(77)
    expect(result.branch).toBe('orchentra/fix/run-42')
    expect(calls).toContain('checkout:orchentra/fix/run-42:main')
    expect(calls).toContain('add:src/fix.ts')
    expect(calls).toContain('push:orchentra/fix/run-42')

    const postPull = captured.find((c) => c.method === 'POST' && c.url.endsWith('/pulls'))
    expect(postPull).toBeDefined()
    expect((postPull?.body as { head: string }).head).toBe('orchentra/fix/run-42')
    expect((postPull?.body as { body: string }).body).toContain('<!-- orchentra:fix-pr key=')
    expect((postPull?.body as { body: string }).body).toContain('**Bug.**')
    expect((postPull?.body as { body: string }).body).toContain('**Fix.**')
    expect((postPull?.body as { body: string }).body).toContain('**Reasoning.**')
  })

  test('updates existing PR when one is already open for the head branch (idempotent)', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({
      existingPulls: [
        {
          number: 55,
          title: 'old title',
          state: 'open',
          html_url: 'https://github.com/o/r/pull/55',
          head: { ref: 'orchentra/fix/run-42', sha: 'sha-head' },
          base: { ref: 'main', sha: 'sha-base' },
        },
      ],
      captured,
    })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.createdPullRequest).toBe(false)
    expect(result.pullRequest?.number).toBe(55)

    const postPull = captured.find((c) => c.method === 'POST' && c.url.endsWith('/pulls'))
    expect(postPull).toBeUndefined()
    const patchPull = captured.find((c) => c.method === 'PATCH' && c.url.includes('/pulls/55'))
    expect(patchPull).toBeDefined()
  })

  test('does not push or open PR when agent makes no changes', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ existingPulls: [], captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: [] })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.changedFiles).toBe(false)
    expect(result.createdPullRequest).toBe(false)
    expect(result.pullRequest).toBeNull()
    expect(calls.find((c) => c.startsWith('add:'))).toBeUndefined()
    expect(calls.find((c) => c.startsWith('push:'))).toBeUndefined()
    const postPull = captured.find((c) => c.method === 'POST' && c.url.endsWith('/pulls'))
    expect(postPull).toBeUndefined()
  })

  test('returns early when no failing jobs (nothing to fix)', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const fetchImpl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/actions/runs/99')) {
        return jsonResponse({
          id: 99,
          name: 'CI',
          head_branch: 'main',
          head_sha: 'sha',
          event: 'push',
          status: 'completed',
          conclusion: 'success',
          html_url: '',
          workflow_id: 1,
        })
      }
      if (url.includes('/actions/runs/99/jobs')) return jsonResponse({ jobs: [] })
      return new Response('no route', { status: 404 })
    }) as unknown as typeof fetch
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: [] })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 99 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.failingJobs).toHaveLength(0)
    expect(result.changedFiles).toBe(false)
    expect(calls.find((c) => c.startsWith('checkout:'))).toBeUndefined()
  })

  test('blocks push and PR when the user rejects the diff preview', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ existingPulls: [], captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'], diff: '+ tweak\n' })

    let presentedDiff = ''
    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (diff: string): Promise<boolean> => {
          presentedDiff = diff
          return false
        },
      },
    )

    expect(presentedDiff).toContain('tweak')
    expect(result.changedFiles).toBe(true)
    expect(result.userConfirmed).toBe(false)
    expect(result.pullRequest).toBeNull()
    expect(result.createdPullRequest).toBe(false)
    expect(calls).toContain('diff:src/fix.ts')
    expect(calls.find((c) => c.startsWith('add:'))).toBeUndefined()
    expect(calls.find((c) => c.startsWith('commit:'))).toBeUndefined()
    expect(calls.find((c) => c.startsWith('push:'))).toBeUndefined()
    const postPull = captured.find((c) => c.method === 'POST' && c.url.endsWith('/pulls'))
    expect(postPull).toBeUndefined()
  })

  test('records userConfirmed=true on the happy path', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ existingPulls: [], captured })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.userConfirmed).toBe(true)
  })

  test('presents the diff produced by GitOps.diffFiles to confirmDiff', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ existingPulls: [], captured })
    const { git } = mockGit({
      beforeFiles: [],
      afterFiles: ['src/fix.ts'],
      diff: 'diff --git a/src/fix.ts b/src/fix.ts\n+ patched\n',
    })

    let received = ''
    await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (diff: string): Promise<boolean> => {
          received = diff
          return true
        },
      },
    )

    expect(received).toContain('diff --git a/src/fix.ts')
    expect(received).toContain('+ patched')
  })
})
