import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  getWorkflowRunOperation,
  type WorkflowRunDetails,
  type GetWorkflowRunError,
} from '../src/ops/github/get-workflow-run'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverrides {
  getWorkflowRun?: GithubAdapter['actions']['getWorkflowRun']
}

function fakeAdapter(actions: ActionsOverrides = {}): GithubAdapter {
  return {
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
      getWorkflowRun:
        actions.getWorkflowRun ??
        (async ({ run_id }) => ({
          data: {
            id: run_id,
            name: 'CI',
            head_branch: 'main',
            head_sha: 'abc1234',
            status: 'completed',
            conclusion: 'failure',
            run_attempt: 2,
            html_url: `https://github.com/my-org/api/actions/runs/${run_id}`,
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:05:00Z',
            jobs_url: `https://api.github.com/repos/my-org/api/actions/runs/${run_id}/jobs`,
            logs_url: `https://api.github.com/repos/my-org/api/actions/runs/${run_id}/logs`,
          },
        })),
      listJobsForWorkflowRun: () => Promise.reject(new Error('not used')),
      downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('not used')),
    },
  }
}

function ok(result: WorkflowRunDetails | GetWorkflowRunError): WorkflowRunDetails {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('get_workflow_run operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns mapped run details for a monitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = ok(await dispatch(getWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 123 }))

    expect(result).toEqual({
      id: 123,
      name: 'CI',
      headBranch: 'main',
      headSha: 'abc1234',
      status: 'completed',
      conclusion: 'failure',
      runAttempt: 2,
      htmlUrl: 'https://github.com/my-org/api/actions/runs/123',
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-01T10:05:00Z',
      jobsUrl: 'https://api.github.com/repos/my-org/api/actions/runs/123/jobs',
      logsUrl: 'https://api.github.com/repos/my-org/api/actions/runs/123/logs',
    })
  })

  test('handler tolerates a missing/null name and missing run_attempt', async () => {
    setGithubAdapter(
      fakeAdapter({
        getWorkflowRun: async ({ run_id }) => ({
          data: {
            id: run_id,
            name: null,
            head_branch: null,
            head_sha: 'sha',
            status: 'in_progress',
            conclusion: null,
            html_url: 'https://github.com/x/y/actions/runs/9',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
            jobs_url: 'https://api.github.com/repos/x/y/actions/runs/9/jobs',
            logs_url: 'https://api.github.com/repos/x/y/actions/runs/9/logs',
          },
        }),
      }),
    )

    const result = ok(await dispatch(getWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 9 }))

    expect(result.name).toBeNull()
    expect(result.headBranch).toBeNull()
    expect(result.runAttempt).toBeNull()
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter())

    const result = (await getWorkflowRunOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as GetWorkflowRunError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    setGithubAdapter(
      fakeAdapter({
        getWorkflowRun: () => Promise.reject(new Error('Not Found')),
      }),
    )

    const result = (await getWorkflowRunOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })) as GetWorkflowRunError

    expect(result.error).toContain('Failed to fetch workflow run')
    expect(result.error).toContain('Not Found')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter())

    let captured: unknown
    try {
      await dispatch(getWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects non-positive or non-integer runId', async () => {
    setGithubAdapter(fakeAdapter())
    for (const runId of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(getWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api', runId })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getWorkflowRunOperation.id).toBe('get_workflow_run')
    expect(getWorkflowRunOperation.scope).toBe('read')
    expect(getWorkflowRunOperation.mutating).toBe(false)
    expect(getWorkflowRunOperation.localOnly).toBe(false)
  })
})
