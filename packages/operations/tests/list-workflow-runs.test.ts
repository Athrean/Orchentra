import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  listWorkflowRunsOperation,
  type ListWorkflowRunsResult,
  type ListWorkflowRunsError,
} from '../src/ops/github/list-workflow-runs'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverrides {
  listWorkflowRunsForRepo?: GithubAdapter['actions']['listWorkflowRunsForRepo']
}

function fakeAdapter(actions: ActionsOverrides = {}): {
  adapter: GithubAdapter
  calls: { listWorkflowRunsForRepo: Array<Parameters<GithubAdapter['actions']['listWorkflowRunsForRepo']>[0]> }
} {
  const calls: {
    listWorkflowRunsForRepo: Array<Parameters<GithubAdapter['actions']['listWorkflowRunsForRepo']>[0]>
  } = { listWorkflowRunsForRepo: [] }
  return {
    adapter: {
      pulls: {
        get: () => Promise.reject(new Error('not used')),
        listFiles: () => Promise.reject(new Error('not used')),
        listReviewComments: () => Promise.reject(new Error('not used')),
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
      actions: {
        listWorkflowRunsForRepo:
          actions.listWorkflowRunsForRepo ??
          (async (params) => {
            calls.listWorkflowRunsForRepo.push(params)
            return {
              data: {
                total_count: 2,
                workflow_runs: [
                  {
                    id: 100,
                    name: 'CI',
                    head_branch: 'main',
                    head_sha: 'abc1234',
                    status: 'completed',
                    conclusion: 'success',
                    run_attempt: 1,
                    html_url: 'https://github.com/my-org/api/actions/runs/100',
                    created_at: '2026-04-01T10:00:00Z',
                    updated_at: '2026-04-01T10:05:00Z',
                    jobs_url: 'https://api.github.com/repos/my-org/api/actions/runs/100/jobs',
                    logs_url: 'https://api.github.com/repos/my-org/api/actions/runs/100/logs',
                    event: 'push',
                  },
                  {
                    id: 101,
                    name: 'CI',
                    head_branch: 'feature/x',
                    head_sha: 'deadbee',
                    status: 'completed',
                    conclusion: 'failure',
                    run_attempt: 2,
                    html_url: 'https://github.com/my-org/api/actions/runs/101',
                    created_at: '2026-04-01T11:00:00Z',
                    updated_at: '2026-04-01T11:03:00Z',
                    jobs_url: 'https://api.github.com/repos/my-org/api/actions/runs/101/jobs',
                    logs_url: 'https://api.github.com/repos/my-org/api/actions/runs/101/logs',
                    event: 'pull_request',
                  },
                ],
              },
            }
          }),
        getWorkflowRun: () => Promise.reject(new Error('not used')),
        listJobsForWorkflowRun: () => Promise.reject(new Error('not used')),
        downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('not used')),
      },
    },
    calls,
  }
}

function ok(result: ListWorkflowRunsResult | ListWorkflowRunsError): ListWorkflowRunsResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('list_workflow_runs operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns mapped runs + totalCount for a monitored repo', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(
      await dispatch(listWorkflowRunsOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        status: 'failure',
        branch: 'main',
        event: 'push',
        perPage: 50,
        page: 2,
      }),
    )

    expect(result.totalCount).toBe(2)
    expect(result.runs).toHaveLength(2)
    expect(result.runs[0]).toEqual({
      id: 100,
      name: 'CI',
      headBranch: 'main',
      headSha: 'abc1234',
      status: 'completed',
      conclusion: 'success',
      runAttempt: 1,
      htmlUrl: 'https://github.com/my-org/api/actions/runs/100',
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-01T10:05:00Z',
      event: 'push',
    })
    expect(result.runs[1].conclusion).toBe('failure')

    // Optional params forwarded as the adapter's snake_case shape.
    expect(calls.listWorkflowRunsForRepo[0]).toEqual({
      owner: 'my-org',
      repo: 'api',
      status: 'failure',
      branch: 'main',
      event: 'push',
      per_page: 50,
      page: 2,
    })
  })

  test('handler omits optional params when not provided', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    ok(await dispatch(listWorkflowRunsOperation, localCtx, { owner: 'my-org', repo: 'api' }))

    expect(calls.listWorkflowRunsForRepo[0]).toEqual({
      owner: 'my-org',
      repo: 'api',
      status: undefined,
      branch: undefined,
      event: undefined,
      per_page: undefined,
      page: undefined,
    })
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    const result = (await listWorkflowRunsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
    })) as ListWorkflowRunsError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    setGithubAdapter(
      fakeAdapter({
        listWorkflowRunsForRepo: () => Promise.reject(new Error('rate limit exceeded')),
      }).adapter,
    )

    const result = (await listWorkflowRunsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
    })) as ListWorkflowRunsError

    expect(result.error).toContain('Failed to list workflow runs')
    expect(result.error).toContain('rate limit')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    let captured: unknown
    try {
      await dispatch(listWorkflowRunsOperation, localCtx, { owner: 'my-org' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects unknown status enum values', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    let captured: unknown
    try {
      await dispatch(listWorkflowRunsOperation, localCtx, {
        owner: 'my-org',
        repo: 'api',
        status: 'definitely-not-a-status',
      })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects perPage outside 1-100', async () => {
    setGithubAdapter(fakeAdapter().adapter)
    for (const perPage of [0, 101, 200]) {
      let captured: unknown
      try {
        await dispatch(listWorkflowRunsOperation, localCtx, { owner: 'my-org', repo: 'api', perPage })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(listWorkflowRunsOperation.id).toBe('list_workflow_runs')
    expect(listWorkflowRunsOperation.scope).toBe('read')
    expect(listWorkflowRunsOperation.mutating).toBe(false)
    expect(listWorkflowRunsOperation.localOnly).toBe(false)
  })
})
