import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listIssuesOperation } from '../src/ops/github/list-issues'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface IssuesListOverride {
  list?: GithubAdapter['issues']['list']
}

function fakeAdapter(
  issues: IssuesListOverride = {},
  capture?: { params?: Parameters<GithubAdapter['issues']['list']>[0] },
): GithubAdapter {
  const defaultList: GithubAdapter['issues']['list'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({
      data: [
        {
          number: 10,
          title: 'CI is flaky',
          state: 'open',
          labels: [{ name: 'bug' }, { name: 'ci' }],
          user: { login: 'alice' },
          assignee: { login: 'bob' },
          created_at: '2026-04-01T10:00:00Z',
          updated_at: '2026-04-02T10:00:00Z',
        },
        {
          number: 11,
          title: 'Add docs',
          state: 'open',
          labels: ['docs'],
          user: { login: 'carol' },
          assignee: null,
          created_at: '2026-04-03T10:00:00Z',
          updated_at: '2026-04-03T10:00:00Z',
          pull_request: { url: 'https://api.github.com/repos/my-org/api/pulls/11' },
        },
      ],
    })
  }
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      list: issues.list ?? defaultList,
      listComments: () => Promise.reject(new Error('not used')),
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

describe('list_issues operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns issue summaries with normalized labels and PR flag', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listIssuesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as {
      issues: Array<{
        number: number
        title: string
        labels: string[]
        assignee: string | null
        isPullRequest: boolean
      }>
    }

    expect(result.issues).toHaveLength(2)
    expect(result.issues[0].number).toBe(10)
    expect(result.issues[0].labels).toEqual(['bug', 'ci'])
    expect(result.issues[0].assignee).toBe('bob')
    expect(result.issues[0].isPullRequest).toBe(false)

    expect(result.issues[1].labels).toEqual(['docs'])
    expect(result.issues[1].assignee).toBeNull()
    expect(result.issues[1].isPullRequest).toBe(true)
  })

  test('handler forwards filter + paging params to the adapter', async () => {
    const capture: { params?: Parameters<GithubAdapter['issues']['list']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listIssuesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      state: 'closed',
      labels: 'bug,p0',
      assignee: 'alice',
      creator: 'bob',
      since: '2026-04-01T00:00:00Z',
      perPage: 25,
      page: 3,
    })

    expect(capture.params?.state).toBe('closed')
    expect(capture.params?.labels).toBe('bug,p0')
    expect(capture.params?.assignee).toBe('alice')
    expect(capture.params?.creator).toBe('bob')
    expect(capture.params?.since).toBe('2026-04-01T00:00:00Z')
    expect(capture.params?.per_page).toBe(25)
    expect(capture.params?.page).toBe(3)
  })

  test('handler defaults perPage to 30', async () => {
    const capture: { params?: Parameters<GithubAdapter['issues']['list']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listIssuesOperation.handler(localCtx, { owner: 'my-org', repo: 'api' })

    expect(capture.params?.per_page).toBe(30)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listIssuesOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ list: () => Promise.reject(new Error('forbidden')) }))

    const result = (await listIssuesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { error: string }

    expect(result.error).toContain('Failed to list issues')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(listIssuesOperation, localCtx, { owner: 'my-org', repo: 'api', state: 'pending' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listIssuesOperation.id).toBe('list_issues')
    expect(listIssuesOperation.scope).toBe('read')
    expect(listIssuesOperation.mutating).toBe(false)
    expect(listIssuesOperation.localOnly).toBe(false)
  })
})
