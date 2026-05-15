import { describe, expect, test } from 'bun:test'
import { GitHubClient } from '@orchentra/cli-api'
import { fix } from '../src/commands/fix'
import type { GhPrOps, GhPrCreateInput, GhPrUpdateInput, GhPrViewResult } from '../src/commands/gh-pr-ops'
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

function mockGh(opts: { existing?: GhPrViewResult | null } = {}): {
  gh: GhPrOps
  calls: { create: GhPrCreateInput[]; update: GhPrUpdateInput[]; findOpenByHead: string[] }
} {
  const createCalls: GhPrCreateInput[] = []
  const updateCalls: GhPrUpdateInput[] = []
  const findOpenByHeadCalls: string[] = []
  const gh: GhPrOps = {
    findOpenByHead: async (_owner, _repo, head): Promise<GhPrViewResult | null> => {
      findOpenByHeadCalls.push(head)
      return opts.existing ?? null
    },
    create: async (input): Promise<GhPrViewResult> => {
      createCalls.push(input)
      return { number: 77, url: `https://github.com/${input.owner}/${input.repo}/pull/77`, state: 'open' }
    },
    update: async (input): Promise<GhPrViewResult> => {
      updateCalls.push(input)
      return {
        number: input.number,
        url: `https://github.com/${input.owner}/${input.repo}/pull/${input.number}`,
        state: 'open',
      }
    },
  }
  return { gh, calls: { create: createCalls, update: updateCalls, findOpenByHead: findOpenByHeadCalls } }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function routeFixFetch(opts: { captured: MockCall[] }): typeof fetch {
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
    return new Response('no route', { status: 404 })
  }) as typeof fetch
}

describe('fix', () => {
  test('opens a new PR when agent produces file changes and none exists', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'
    process.env.ORCHENTRA_ALLOWED_ORGS = ''

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })
    const { gh, calls: ghCalls } = mockGh({ existing: null })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
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

    expect(ghCalls.create).toHaveLength(1)
    expect(ghCalls.create[0].head).toBe('orchentra/fix/run-42')
    expect(ghCalls.create[0].base).toBe('main')
    expect(ghCalls.create[0].body).toContain('<!-- orchentra:fix-pr key=')
    expect(ghCalls.create[0].body).toContain('**Bug.**')
    expect(ghCalls.create[0].body).toContain('**Fix.**')
    expect(ghCalls.create[0].body).toContain('**Reasoning.**')
  })

  test('updates existing PR via gh CLI when one is already open (idempotent)', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ captured })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })
    const { gh, calls: ghCalls } = mockGh({
      existing: { number: 55, url: 'https://github.com/o/r/pull/55', state: 'open' },
    })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
      },
    )

    expect(result.createdPullRequest).toBe(false)
    expect(result.pullRequest?.number).toBe(55)
    expect(ghCalls.create).toHaveLength(0)
    expect(ghCalls.update).toHaveLength(1)
    expect(ghCalls.update[0].number).toBe(55)
  })

  test('does not push or open PR when agent makes no changes', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: [] })
    const { gh, calls: ghCalls } = mockGh({ existing: null })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
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
    expect(ghCalls.create).toHaveLength(0)
    expect(ghCalls.update).toHaveLength(0)
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
    const fetchImpl = routeFixFetch({ captured })
    const { git, calls } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'], diff: '+ tweak\n' })
    const { gh, calls: ghCalls } = mockGh({ existing: null })

    let presentedDiff = ''
    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
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
    expect(ghCalls.create).toHaveLength(0)
    expect(ghCalls.update).toHaveLength(0)
  })

  test('records userConfirmed=true on the happy path', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const captured: MockCall[] = []
    const fetchImpl = routeFixFetch({ captured })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })
    const { gh } = mockGh({ existing: null })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
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
    const fetchImpl = routeFixFetch({ captured })
    const { git } = mockGit({
      beforeFiles: [],
      afterFiles: ['src/fix.ts'],
      diff: 'diff --git a/src/fix.ts b/src/fix.ts\n+ patched\n',
    })
    const { gh } = mockGh({ existing: null })

    let received = ''
    await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
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

  test('--auto-merge polls CI when PR is opened and surfaces the outcome', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const fetchImpl = routeFixFetch({ captured: [] })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })
    const { gh } = mockGh({ existing: null })

    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      { autoMerge: true },
      {
        cli: mockCli(),
        git,
        gh,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
        pollCi: async (options) => {
          expect(options.branch).toBe('orchentra/fix/run-42')
          return { status: 'success', polls: 1, failingJobs: [] }
        },
      },
    )

    expect(result.pollOutcome).toEqual({ status: 'success', polls: 1, failingJobs: [] })
  })

  test('auto-merge is off by default and pollCi is not invoked', async () => {
    process.env.ORCHENTRA_GITHUB_TOKEN = 'test-token'

    const fetchImpl = routeFixFetch({ captured: [] })
    const { git } = mockGit({ beforeFiles: [], afterFiles: ['src/fix.ts'] })
    const { gh } = mockGh({ existing: null })

    let pollCalls = 0
    const result = await fix(
      { owner: 'o', repo: 'r', runId: 42 },
      {},
      {
        cli: mockCli(),
        git,
        gh,
        clientFactory: (token: string): GitHubClient => new GitHubClient({ token, fetchImpl }),
        write: (): void => {},
        confirmDiff: async (): Promise<boolean> => true,
        pollCi: async () => {
          pollCalls++
          return { status: 'success', polls: 1, failingJobs: [] }
        },
      },
    )

    expect(pollCalls).toBe(0)
    expect(result.pollOutcome).toBeUndefined()
  })
})
