import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { searchCodeOperation } from '../src/ops/github/search-code'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

function fakeAdapter(searchCode?: GithubAdapter['search']['code'], capture?: { q?: string }): GithubAdapter {
  const defaultSearch: GithubAdapter['search']['code'] = (p) => {
    if (capture) capture.q = p.q
    return Promise.resolve({
      data: {
        total_count: 2,
        items: [
          { path: 'src/auth/login.ts', name: 'login.ts' },
          { path: 'tests/auth/login.test.ts', name: 'login.test.ts' },
        ],
      },
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
      code: searchCode ?? defaultSearch,
    },
  }
}

describe('search_code operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns matching paths', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await searchCodeOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      query: 'loginHandler',
    })) as { total: number; results: Array<{ path: string }> }

    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].path).toBe('src/auth/login.ts')
  })

  test('handler returns empty results when nothing matches', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.resolve({ data: { total_count: 0, items: [] } })))

    const result = (await searchCodeOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      query: 'nonexistent',
    })) as { total: number; results: unknown[] }

    expect(result.total).toBe(0)
    expect(result.results).toHaveLength(0)
  })

  test('handler strips scope qualifiers from query', async () => {
    const capture: { q?: string } = {}
    setGithubAdapter(fakeAdapter(undefined, capture))

    await searchCodeOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      query: 'password repo:other-org/secret-repo',
    })

    expect(capture.q).toBe('password repo:my-org/api')
  })

  test('handler strips scope qualifiers regardless of case (regression)', async () => {
    const capture: { q?: string } = {}
    setGithubAdapter(fakeAdapter(undefined, capture))

    await searchCodeOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      query: 'password REPO:other/secret ORG:bigcorp User:rogue',
    })

    expect(capture.q).toBe('password repo:my-org/api')
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await searchCodeOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      query: 'password',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter(() => Promise.reject(new Error('Search rate limited'))))

    const result = (await searchCodeOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      query: 'test',
    })) as { error: string }

    expect(result.error).toContain('Failed to search code')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(searchCodeOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(searchCodeOperation.id).toBe('search_code')
    expect(searchCodeOperation.scope).toBe('read')
    expect(searchCodeOperation.mutating).toBe(false)
    expect(searchCodeOperation.localOnly).toBe(false)
  })
})
