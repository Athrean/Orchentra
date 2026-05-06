import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  cancelWorkflowRunOperation,
  type CancelWorkflowRunError,
  type CancelWorkflowRunResult,
} from '../src/ops/github/cancel-workflow-run'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface CapturedCall {
  owner: string
  repo: string
  run_id: number
}

function fakeAdapter(overrides: Partial<GithubAdapter['actions']> = {}): {
  adapter: GithubAdapter
  calls: { cancelWorkflowRun: CapturedCall[] }
} {
  const calls: { cancelWorkflowRun: CapturedCall[] } = { cancelWorkflowRun: [] }
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
      reRunWorkflowFailedJobs: overrides.reRunWorkflowFailedJobs ?? (async () => undefined),
      cancelWorkflowRun:
        overrides.cancelWorkflowRun ??
        (async (params) => {
          calls.cancelWorkflowRun.push(params)
        }),
      createWorkflowDispatch: overrides.createWorkflowDispatch ?? (async () => undefined),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
  return { adapter, calls }
}

function ok(result: CancelWorkflowRunResult | CancelWorkflowRunError): CancelWorkflowRunResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('cancel_workflow_run operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns ok and forwards run_id', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(
      await dispatch(cancelWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 555 }),
    )

    expect(result).toEqual({ ok: true })
    expect(calls.cancelWorkflowRun).toHaveLength(1)
    expect(calls.cancelWorkflowRun[0]).toEqual({ owner: 'my-org', repo: 'api', run_id: 555 })
  })

  test('handler rejects unmonitored repo', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = (await cancelWorkflowRunOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as CancelWorkflowRunError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    const { adapter } = fakeAdapter({
      cancelWorkflowRun: () => Promise.reject(new Error('Conflict: run already completed')),
    })
    setGithubAdapter(adapter)

    const result = (await cancelWorkflowRunOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })) as CancelWorkflowRunError

    expect(result.error).toContain('Failed to cancel workflow run')
    expect(result.error).toContain('Conflict')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    let captured: unknown
    try {
      await dispatch(cancelWorkflowRunOperation, localCtx, { owner: 'my-org', repo: 'api', runId: -1 })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('declares write scope, mutating, not local-only', () => {
    expect(cancelWorkflowRunOperation.id).toBe('cancel_workflow_run')
    expect(cancelWorkflowRunOperation.scope).toBe('write')
    expect(cancelWorkflowRunOperation.trustClass).toBe('write')
    expect(cancelWorkflowRunOperation.mutating).toBe(true)
    expect(cancelWorkflowRunOperation.localOnly).toBe(false)
  })

  test('dispatch on a remote ctx without approval returns permission_denied', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)
    const remoteCtx: OperationContext = { remote: true, allowedScopes: new Set(['read', 'write', 'admin']) }

    let captured: unknown
    try {
      await dispatch(cancelWorkflowRunOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 1 })
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
      (await dispatch(cancelWorkflowRunOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 5 })) as
        | CancelWorkflowRunResult
        | CancelWorkflowRunError,
    )

    expect(result).toEqual({ ok: true })
    expect(calls.cancelWorkflowRun).toHaveLength(1)
  })
})
