import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getPullRequestOperation } from '../src/ops/github/get-pull-request'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface PullsOverrides {
  get?: GithubAdapter['pulls']['get']
  listFiles?: GithubAdapter['pulls']['listFiles']
  listReviewComments?: GithubAdapter['pulls']['listReviewComments']
}

function fakeAdapter(pulls: PullsOverrides = {}): GithubAdapter {
  return {
    pulls: {
      get:
        pulls.get ??
        (() =>
          Promise.resolve({
            data: {
              title: 'Fix login bug',
              body: 'This PR fixes the login issue',
              state: 'open',
              merged: false,
              user: { login: 'dev1' },
              base: { ref: 'main' },
              head: { ref: 'fix/login' },
              created_at: '2026-04-01T10:00:00Z',
            },
          })),
      listFiles:
        pulls.listFiles ??
        (() =>
          Promise.resolve({ data: [{ filename: 'src/auth.ts', status: 'modified', additions: 5, deletions: 2 }] })),
      listReviewComments:
        pulls.listReviewComments ?? (() => Promise.resolve({ data: [{ user: { login: 'reviewer1' }, body: 'LGTM' }] })),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('get_pull_request operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns PR with files and comments', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 42,
    })) as {
      title: string
      files: Array<{ filename: string }>
      comments: Array<{ user?: string }>
    }

    expect(result.title).toBe('Fix login bug')
    expect(result.files).toHaveLength(1)
    expect(result.files[0].filename).toBe('src/auth.ts')
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].user).toBe('reviewer1')
  })

  test('handler truncates long body', async () => {
    setGithubAdapter(
      fakeAdapter({
        get: () =>
          Promise.resolve({
            data: {
              title: 'Big PR',
              body: 'x'.repeat(5000),
              state: 'open',
              merged: false,
              user: { login: 'dev' },
              base: { ref: 'main' },
              head: { ref: 'feature' },
              created_at: '2026-04-01T10:00:00Z',
            },
          }),
        listFiles: () => Promise.resolve({ data: [] }),
        listReviewComments: () => Promise.resolve({ data: [] }),
      }),
    )

    const result = (await getPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 1,
    })) as { body: string }

    expect(result.body.length).toBeLessThanOrEqual(3000)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getPullRequestOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      number: 1,
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(
      fakeAdapter({
        get: () => Promise.reject(new Error('Not Found')),
      }),
    )

    const result = (await getPullRequestOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 999,
    })) as { error: string }

    expect(result.error).toContain('Failed to fetch PR')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(getPullRequestOperation, localCtx, { owner: 'my-org', repo: 'api', number: 'forty-two' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects non-positive or non-integer PR number', async () => {
    setGithubAdapter(fakeAdapter())
    for (const number of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(getPullRequestOperation, localCtx, { owner: 'my-org', repo: 'api', number })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getPullRequestOperation.id).toBe('get_pull_request')
    expect(getPullRequestOperation.scope).toBe('read')
    expect(getPullRequestOperation.mutating).toBe(false)
    expect(getPullRequestOperation.localOnly).toBe(false)
  })
})
