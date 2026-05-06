import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listBranchesOperation } from '../src/ops/github/list-branches'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ReposOverride {
  listBranches?: GithubAdapter['repos']['listBranches']
}

function fakeAdapter(
  repos: ReposOverride = {},
  capture?: { params?: Parameters<GithubAdapter['repos']['listBranches']>[0] },
): GithubAdapter {
  const defaultListBranches: GithubAdapter['repos']['listBranches'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({
      data: [
        { name: 'main', protected: true, commit: { sha: 'abc1234' } },
        { name: 'feature/login', protected: false, commit: { sha: 'def5678' } },
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
      list: () => Promise.reject(new Error('not used')),
      listComments: () => Promise.reject(new Error('not used')),
    },
    repos: {
      get: () => Promise.reject(new Error('not used')),
      getCommit: () => Promise.reject(new Error('not used')),
      getContent: () => Promise.reject(new Error('not used')),
      listBranches: repos.listBranches ?? defaultListBranches,
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

describe('list_branches operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns branches with protection + sha', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listBranchesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { branches: Array<{ name: string; protected: boolean; sha: string }> }

    expect(result.branches).toHaveLength(2)
    expect(result.branches[0].name).toBe('main')
    expect(result.branches[0].protected).toBe(true)
    expect(result.branches[0].sha).toBe('abc1234')
    expect(result.branches[1].protected).toBe(false)
  })

  test('handler forwards `protected` filter + paging', async () => {
    const capture: { params?: Parameters<GithubAdapter['repos']['listBranches']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listBranchesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      protected: true,
      perPage: 10,
      page: 2,
    })

    expect(capture.params?.protected).toBe(true)
    expect(capture.params?.per_page).toBe(10)
    expect(capture.params?.page).toBe(2)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listBranchesOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ listBranches: () => Promise.reject(new Error('boom')) }))

    const result = (await listBranchesOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as { error: string }

    expect(result.error).toContain('Failed to list branches')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(listBranchesOperation, localCtx, { owner: 'my-org' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listBranchesOperation.id).toBe('list_branches')
    expect(listBranchesOperation.scope).toBe('read')
    expect(listBranchesOperation.mutating).toBe(false)
    expect(listBranchesOperation.localOnly).toBe(false)
  })
})
