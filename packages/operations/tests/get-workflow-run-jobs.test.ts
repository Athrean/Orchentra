import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  getWorkflowRunJobsOperation,
  type GetWorkflowRunJobsResult,
  type GetWorkflowRunJobsError,
} from '../src/ops/github/get-workflow-run-jobs'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverrides {
  listJobsForWorkflowRun?: GithubAdapter['actions']['listJobsForWorkflowRun']
}

function fakeAdapter(actions: ActionsOverrides = {}): {
  adapter: GithubAdapter
  calls: { listJobsForWorkflowRun: Array<Parameters<GithubAdapter['actions']['listJobsForWorkflowRun']>[0]> }
} {
  const calls: {
    listJobsForWorkflowRun: Array<Parameters<GithubAdapter['actions']['listJobsForWorkflowRun']>[0]>
  } = { listJobsForWorkflowRun: [] }
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
        listWorkflowRunsForRepo: () => Promise.reject(new Error('not used')),
        getWorkflowRun: () => Promise.reject(new Error('not used')),
        listJobsForWorkflowRun:
          actions.listJobsForWorkflowRun ??
          (async (params) => {
            calls.listJobsForWorkflowRun.push(params)
            return {
              data: {
                total_count: 2,
                jobs: [
                  {
                    id: 1,
                    name: 'Build',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2026-04-01T10:00:00Z',
                    completed_at: '2026-04-01T10:02:00Z',
                    steps: [
                      {
                        name: 'Checkout',
                        status: 'completed',
                        conclusion: 'success',
                        number: 1,
                        started_at: '2026-04-01T10:00:00Z',
                        completed_at: '2026-04-01T10:00:30Z',
                      },
                      {
                        name: 'Run tests',
                        status: 'completed',
                        conclusion: 'success',
                        number: 2,
                        started_at: '2026-04-01T10:00:30Z',
                        completed_at: '2026-04-01T10:02:00Z',
                      },
                    ],
                  },
                  {
                    id: 2,
                    name: 'Deploy',
                    status: 'completed',
                    conclusion: 'failure',
                    started_at: '2026-04-01T10:02:00Z',
                    completed_at: '2026-04-01T10:03:00Z',
                  },
                ],
              },
            }
          }),
        downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('not used')),
      },
    },
    calls,
  }
}

function ok(result: GetWorkflowRunJobsResult | GetWorkflowRunJobsError): GetWorkflowRunJobsResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('get_workflow_run_jobs operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns mapped jobs + steps for a monitored repo', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(
      await dispatch(getWorkflowRunJobsOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 100 }),
    )

    expect(result.jobs).toHaveLength(2)
    expect(result.jobs[0]).toEqual({
      id: 1,
      name: 'Build',
      status: 'completed',
      conclusion: 'success',
      startedAt: '2026-04-01T10:00:00Z',
      completedAt: '2026-04-01T10:02:00Z',
      steps: [
        {
          name: 'Checkout',
          status: 'completed',
          conclusion: 'success',
          number: 1,
          startedAt: '2026-04-01T10:00:00Z',
          completedAt: '2026-04-01T10:00:30Z',
        },
        {
          name: 'Run tests',
          status: 'completed',
          conclusion: 'success',
          number: 2,
          startedAt: '2026-04-01T10:00:30Z',
          completedAt: '2026-04-01T10:02:00Z',
        },
      ],
    })
    // Job with no `steps` field becomes an empty steps array (not undefined).
    expect(result.jobs[1].steps).toEqual([])
    expect(result.jobs[1].conclusion).toBe('failure')

    expect(calls.listJobsForWorkflowRun[0]).toEqual({
      owner: 'my-org',
      repo: 'api',
      run_id: 100,
      attempt_number: undefined,
    })
  })

  test('handler forwards optional attempt number to the adapter', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    ok(await dispatch(getWorkflowRunJobsOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 100, attempt: 3 }))

    expect(calls.listJobsForWorkflowRun[0].attempt_number).toBe(3)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    const result = (await getWorkflowRunJobsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as GetWorkflowRunJobsError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    setGithubAdapter(
      fakeAdapter({
        listJobsForWorkflowRun: () => Promise.reject(new Error('rate limit exceeded')),
      }).adapter,
    )

    const result = (await getWorkflowRunJobsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })) as GetWorkflowRunJobsError

    expect(result.error).toContain('Failed to fetch workflow run jobs')
    expect(result.error).toContain('rate limit')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    let captured: unknown
    try {
      await dispatch(getWorkflowRunJobsOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects non-positive runId or attempt', async () => {
    setGithubAdapter(fakeAdapter().adapter)
    for (const params of [
      { owner: 'my-org', repo: 'api', runId: 0 },
      { owner: 'my-org', repo: 'api', runId: 1, attempt: 0 },
      { owner: 'my-org', repo: 'api', runId: 1, attempt: -1 },
    ]) {
      let captured: unknown
      try {
        await dispatch(getWorkflowRunJobsOperation, localCtx, params)
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getWorkflowRunJobsOperation.id).toBe('get_workflow_run_jobs')
    expect(getWorkflowRunJobsOperation.scope).toBe('read')
    expect(getWorkflowRunJobsOperation.mutating).toBe(false)
    expect(getWorkflowRunJobsOperation.localOnly).toBe(false)
  })
})
