import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  rerunFailedJobsOperation,
  type RerunFailedJobsError,
  type RerunFailedJobsResult,
} from '../src/ops/github/rerun-failed-jobs'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface CapturedCall {
  owner: string
  repo: string
  run_id: number
  enable_debug_logging?: boolean
}

function fakeAdapter(overrides: Partial<GithubAdapter['actions']> = {}): {
  adapter: GithubAdapter
  calls: { reRunWorkflowFailedJobs: CapturedCall[] }
} {
  const calls: { reRunWorkflowFailedJobs: CapturedCall[] } = { reRunWorkflowFailedJobs: [] }
  const adapter: GithubAdapter = {
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
      listWorkflowRunsForRepo: () => Promise.reject(new Error('not used')),
      getWorkflowRun: () => Promise.reject(new Error('not used')),
      listJobsForWorkflowRun: () => Promise.reject(new Error('not used')),
      downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('not used')),
      listWorkflowRunArtifacts: () => Promise.reject(new Error('not used')),
      downloadArtifact: () => Promise.reject(new Error('not used')),
      reRunWorkflow: overrides.reRunWorkflow ?? (async () => undefined),
      reRunWorkflowFailedJobs:
        overrides.reRunWorkflowFailedJobs ??
        (async (params) => {
          calls.reRunWorkflowFailedJobs.push(params)
        }),
      cancelWorkflowRun: overrides.cancelWorkflowRun ?? (async () => undefined),
      createWorkflowDispatch: overrides.createWorkflowDispatch ?? (async () => undefined),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
  return { adapter, calls }
}

function ok(result: RerunFailedJobsResult | RerunFailedJobsError): RerunFailedJobsResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('rerun_failed_jobs operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns ok and forwards run_id', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(await dispatch(rerunFailedJobsOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 42 }))

    expect(result).toEqual({ ok: true })
    expect(calls.reRunWorkflowFailedJobs).toHaveLength(1)
    expect(calls.reRunWorkflowFailedJobs[0]).toEqual({ owner: 'my-org', repo: 'api', run_id: 42 })
  })

  test('handler forwards enable_debug_logging when set', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    await dispatch(rerunFailedJobsOperation, localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 42,
      enableDebugLogging: false,
    })

    expect(calls.reRunWorkflowFailedJobs[0].enable_debug_logging).toBe(false)
  })

  test('handler rejects unmonitored repo', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = (await rerunFailedJobsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as RerunFailedJobsError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    const { adapter } = fakeAdapter({
      reRunWorkflowFailedJobs: () => Promise.reject(new Error('Run not found')),
    })
    setGithubAdapter(adapter)

    const result = (await rerunFailedJobsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })) as RerunFailedJobsError

    expect(result.error).toContain('Failed to re-run failed jobs')
    expect(result.error).toContain('Run not found')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    let captured: unknown
    try {
      await dispatch(rerunFailedJobsOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('declares write scope, mutating, not local-only', () => {
    expect(rerunFailedJobsOperation.id).toBe('rerun_failed_jobs')
    expect(rerunFailedJobsOperation.scope).toBe('write')
    expect(rerunFailedJobsOperation.trustClass).toBe('write')
    expect(rerunFailedJobsOperation.mutating).toBe(true)
    expect(rerunFailedJobsOperation.localOnly).toBe(false)
  })

  test('dispatch on a remote ctx without approval returns permission_denied', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)
    const remoteCtx: OperationContext = { remote: true, allowedScopes: new Set(['read', 'write', 'admin']) }

    let captured: unknown
    try {
      await dispatch(rerunFailedJobsOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 1 })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('permission_denied')
  })

  test('dispatch on a remote ctx with approved approval runs the handler', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)
    const remoteCtx: OperationContext = {
      remote: true,
      allowedScopes: new Set(['read', 'write', 'admin']),
      approval: async () => ({ status: 'approved' }),
    }

    const result = ok(
      (await dispatch(rerunFailedJobsOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 5 })) as
        | RerunFailedJobsResult
        | RerunFailedJobsError,
    )

    expect(result).toEqual({ ok: true })
    expect(calls.reRunWorkflowFailedJobs).toHaveLength(1)
  })
})
