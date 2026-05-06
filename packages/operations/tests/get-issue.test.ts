import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getIssueOperation } from '../src/ops/github/get-issue'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface IssuesOverrides {
  get?: GithubAdapter['issues']['get']
  listComments?: GithubAdapter['issues']['listComments']
}

function fakeAdapter(issues: IssuesOverrides = {}): GithubAdapter {
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get:
        issues.get ??
        (() =>
          Promise.resolve({
            data: {
              title: 'CI keeps failing on main',
              body: 'The build has been broken since yesterday',
              state: 'open',
              labels: [{ name: 'bug' }, { name: 'ci' }],
              user: { login: 'dev1' },
              created_at: '2026-04-01T10:00:00Z',
            },
          })),
      list: () => Promise.reject(new Error('not used')),
      listComments:
        issues.listComments ??
        (() => Promise.resolve({ data: [{ user: { login: 'dev2' }, body: 'Same issue here' }] })),
    },
    repos: {
      get: () => Promise.reject(new Error('not used')),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: () => Promise.reject(new Error('not used')),
      listLanguages: () => Promise.reject(new Error('not used')),
      getAllTopics: () => Promise.reject(new Error('not used')),
    },
    checks: {
      listForRef: () => Promise.reject(new Error('not used')),
    },
    actions: {
      listWorkflowRunArtifacts: () => Promise.reject(new Error('not used')),
      downloadArtifact: () => Promise.reject(new Error('not used')),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
}

describe('get_issue operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns issue with labels and comments', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 10,
    })) as {
      title: string
      labels: string[]
      comments: Array<{ user?: string }>
    }

    expect(result.title).toBe('CI keeps failing on main')
    expect(result.labels).toEqual(['bug', 'ci'])
    expect(result.comments).toHaveLength(1)
    expect(result.comments[0].user).toBe('dev2')
  })

  test('handler handles string-shaped labels', async () => {
    setGithubAdapter(
      fakeAdapter({
        get: () =>
          Promise.resolve({
            data: {
              title: 'Test',
              body: null,
              state: 'open',
              labels: ['bug', 'ci'],
              user: { login: 'dev' },
              created_at: '2026-04-01T10:00:00Z',
            },
          }),
        listComments: () => Promise.resolve({ data: [] }),
      }),
    )

    const result = (await getIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 5,
    })) as { labels: string[] }

    expect(result.labels).toEqual(['bug', 'ci'])
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getIssueOperation.handler(localCtx, {
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

    const result = (await getIssueOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      number: 999,
    })) as { error: string }

    expect(result.error).toContain('Failed to fetch issue')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(getIssueOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects non-positive or non-integer issue number', async () => {
    setGithubAdapter(fakeAdapter())
    for (const number of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(getIssueOperation, localCtx, { owner: 'my-org', repo: 'api', number })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getIssueOperation.id).toBe('get_issue')
    expect(getIssueOperation.scope).toBe('read')
    expect(getIssueOperation.mutating).toBe(false)
    expect(getIssueOperation.localOnly).toBe(false)
  })
})
