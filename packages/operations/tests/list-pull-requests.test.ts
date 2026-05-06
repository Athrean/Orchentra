import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listPullRequestsOperation } from '../src/ops/github/list-pull-requests'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface PullsListOverride {
  list?: GithubAdapter['pulls']['list']
}

function fakeAdapter(
  pulls: PullsListOverride = {},
  capture?: { params?: Parameters<GithubAdapter['pulls']['list']>[0] },
): GithubAdapter {
  const defaultList: GithubAdapter['pulls']['list'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({
      data: [
        {
          number: 7,
          title: 'Add login flow',
          state: 'open',
          user: { login: 'alice' },
          base: { ref: 'main' },
          head: { ref: 'feature/login' },
          created_at: '2026-04-01T10:00:00Z',
          updated_at: '2026-04-02T10:00:00Z',
          draft: false,
        },
        {
          number: 8,
          title: 'WIP: refactor auth',
          state: 'open',
          user: { login: 'bob' },
          base: { ref: 'main' },
          head: { ref: 'wip/auth' },
          created_at: '2026-04-03T10:00:00Z',
          updated_at: '2026-04-03T10:00:00Z',
          draft: true,
        },
      ],
    })
  }
  return {
    pulls: {
      get: () => Promise.reject(new Error('not used')),
      list: pulls.list ?? defaultList,
      listFiles: () => Promise.reject(new Error('not used')),
      listReviewComments: () => Promise.reject(new Error('not used')),
    },
    issues: {
      get: () => Promise.reject(new Error('not used')),
      list: () => Promise.reject(new Error('not used')),
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

describe('list_pull_requests operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns PR summaries for a monitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listPullRequestsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { prs: Array<{ number: number; title: string; state: string; draft: boolean }> }

    expect(result.prs).toHaveLength(2)
    expect(result.prs[0].number).toBe(7)
    expect(result.prs[0].title).toBe('Add login flow')
    expect(result.prs[0].draft).toBe(false)
    expect(result.prs[1].draft).toBe(true)
  })

  test('handler forwards filter + paging params to the adapter', async () => {
    const capture: { params?: Parameters<GithubAdapter['pulls']['list']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listPullRequestsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      state: 'closed',
      head: 'my-org:fix/login',
      base: 'main',
      sort: 'updated',
      direction: 'asc',
      perPage: 50,
      page: 2,
    })

    expect(capture.params?.state).toBe('closed')
    expect(capture.params?.head).toBe('my-org:fix/login')
    expect(capture.params?.base).toBe('main')
    expect(capture.params?.sort).toBe('updated')
    expect(capture.params?.direction).toBe('asc')
    expect(capture.params?.per_page).toBe(50)
    expect(capture.params?.page).toBe(2)
  })

  test('handler defaults perPage to 30 when not provided', async () => {
    const capture: { params?: Parameters<GithubAdapter['pulls']['list']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listPullRequestsOperation.handler(localCtx, { owner: 'my-org', repo: 'api' })

    expect(capture.params?.per_page).toBe(30)
  })

  test('handler returns empty list when no PRs match', async () => {
    setGithubAdapter(fakeAdapter({ list: () => Promise.resolve({ data: [] }) }))

    const result = (await listPullRequestsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { prs: unknown[] }

    expect(result.prs).toHaveLength(0)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listPullRequestsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ list: () => Promise.reject(new Error('rate limited')) }))

    const result = (await listPullRequestsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { error: string }

    expect(result.error).toContain('Failed to list PRs')
    expect(result.error).toContain('rate limited')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(listPullRequestsOperation, localCtx, { owner: 'my-org', repo: 'api', state: 'invalid' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects perPage above 100', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(listPullRequestsOperation, localCtx, { owner: 'my-org', repo: 'api', perPage: 500 })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listPullRequestsOperation.id).toBe('list_pull_requests')
    expect(listPullRequestsOperation.scope).toBe('read')
    expect(listPullRequestsOperation.mutating).toBe(false)
    expect(listPullRequestsOperation.localOnly).toBe(false)
  })
})
