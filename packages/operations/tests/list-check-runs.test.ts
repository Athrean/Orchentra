import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { listCheckRunsOperation } from '../src/ops/github/list-check-runs'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ChecksOverride {
  listForRef?: GithubAdapter['checks']['listForRef']
}

function fakeAdapter(
  checks: ChecksOverride = {},
  capture?: { params?: Parameters<GithubAdapter['checks']['listForRef']>[0] },
): GithubAdapter {
  const defaultListForRef: GithubAdapter['checks']['listForRef'] = (p) => {
    if (capture) capture.params = p
    return Promise.resolve({
      data: {
        total_count: 2,
        check_runs: [
          {
            id: 1001,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-04-01T10:00:00Z',
            completed_at: '2026-04-01T10:05:00Z',
            head_sha: 'abc1234',
            html_url: 'https://github.com/my-org/api/runs/1001',
          },
          {
            id: 1002,
            name: 'tests',
            status: 'completed',
            conclusion: 'failure',
            started_at: '2026-04-01T10:00:00Z',
            completed_at: '2026-04-01T10:10:00Z',
            head_sha: 'abc1234',
            html_url: null,
          },
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
      listForRef: checks.listForRef ?? defaultListForRef,
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

describe('list_check_runs operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns check runs with total', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listCheckRunsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      ref: 'abc1234',
    })) as {
      total: number
      checkRuns: Array<{ id: number; name: string; conclusion: string | null; htmlUrl: string | null }>
    }

    expect(result.total).toBe(2)
    expect(result.checkRuns).toHaveLength(2)
    expect(result.checkRuns[0].name).toBe('build')
    expect(result.checkRuns[0].conclusion).toBe('success')
    expect(result.checkRuns[1].conclusion).toBe('failure')
    expect(result.checkRuns[1].htmlUrl).toBeNull()
  })

  test('handler forwards ref + paging params to the adapter', async () => {
    const capture: { params?: Parameters<GithubAdapter['checks']['listForRef']>[0] } = {}
    setGithubAdapter(fakeAdapter({}, capture))

    await listCheckRunsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      ref: 'main',
      perPage: 50,
      page: 2,
    })

    expect(capture.params?.ref).toBe('main')
    expect(capture.params?.per_page).toBe(50)
    expect(capture.params?.page).toBe(2)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await listCheckRunsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      ref: 'abc',
    })) as { error: string }

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error on adapter throw', async () => {
    setGithubAdapter(fakeAdapter({ listForRef: () => Promise.reject(new Error('bad ref')) }))

    const result = (await listCheckRunsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      ref: 'deadbeef',
    })) as { error: string }

    expect(result.error).toContain('Failed to list check runs')
  })

  test('dispatch rejects missing ref with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(listCheckRunsOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listCheckRunsOperation.id).toBe('list_check_runs')
    expect(listCheckRunsOperation.scope).toBe('read')
    expect(listCheckRunsOperation.mutating).toBe(false)
    expect(listCheckRunsOperation.localOnly).toBe(false)
  })
})
