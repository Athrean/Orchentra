import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import {
  rerunWorkflowOperation,
  type RerunWorkflowError,
  type RerunWorkflowResult,
} from '../src/ops/github/rerun-workflow'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface CapturedRerunCall {
  owner: string
  repo: string
  run_id: number
  enable_debug_logging?: boolean
}

function fakeAdapter(overrides: Partial<GithubAdapter['actions']> = {}): {
  adapter: GithubAdapter
  calls: { reRunWorkflow: CapturedRerunCall[] }
} {
  const calls: { reRunWorkflow: CapturedRerunCall[] } = { reRunWorkflow: [] }
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
      reRunWorkflow:
        overrides.reRunWorkflow ??
        (async (params) => {
          calls.reRunWorkflow.push(params)
        }),
      reRunWorkflowFailedJobs: overrides.reRunWorkflowFailedJobs ?? (async () => undefined),
      cancelWorkflowRun: overrides.cancelWorkflowRun ?? (async () => undefined),
      createWorkflowDispatch: overrides.createWorkflowDispatch ?? (async () => undefined),
    },
    search: {
      code: () => Promise.reject(new Error('not used')),
    },
  }
  return { adapter, calls }
}

function ok(result: RerunWorkflowResult | RerunWorkflowError): RerunWorkflowResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('rerun_workflow operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns ok and forwards run_id to the adapter', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(await dispatch(rerunWorkflowOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 123 }))

    expect(result).toEqual({ ok: true })
    expect(calls.reRunWorkflow).toHaveLength(1)
    expect(calls.reRunWorkflow[0]).toEqual({ owner: 'my-org', repo: 'api', run_id: 123 })
  })

  test('handler forwards enable_debug_logging when set', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    await dispatch(rerunWorkflowOperation, localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 123,
      enableDebugLogging: true,
    })

    expect(calls.reRunWorkflow[0].enable_debug_logging).toBe(true)
  })

  test('handler omits enable_debug_logging when unset', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    await dispatch(rerunWorkflowOperation, localCtx, { owner: 'my-org', repo: 'api', runId: 7 })

    expect('enable_debug_logging' in calls.reRunWorkflow[0]).toBe(false)
  })

  test('handler rejects unmonitored repo', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = (await rerunWorkflowOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      runId: 1,
    })) as RerunWorkflowError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    const { adapter } = fakeAdapter({
      reRunWorkflow: () => Promise.reject(new Error('Conflict: run already finished')),
    })
    setGithubAdapter(adapter)

    const result = (await rerunWorkflowOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })) as RerunWorkflowError

    expect(result.error).toContain('Failed to re-run workflow')
    expect(result.error).toContain('Conflict')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)

    let captured: unknown
    try {
      await dispatch(rerunWorkflowOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('declares write scope, mutating, not local-only', () => {
    expect(rerunWorkflowOperation.id).toBe('rerun_workflow')
    expect(rerunWorkflowOperation.scope).toBe('write')
    expect(rerunWorkflowOperation.trustClass).toBe('write')
    expect(rerunWorkflowOperation.mutating).toBe(true)
    expect(rerunWorkflowOperation.localOnly).toBe(false)
  })

  test('dispatch on a remote ctx without approval returns permission_denied', async () => {
    const { adapter } = fakeAdapter()
    setGithubAdapter(adapter)
    const remoteCtx: OperationContext = { remote: true, allowedScopes: new Set(['read', 'write', 'admin']) }

    let captured: unknown
    try {
      await dispatch(rerunWorkflowOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 1 })
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
      (await dispatch(rerunWorkflowOperation, remoteCtx, { owner: 'my-org', repo: 'api', runId: 5 })) as
        | RerunWorkflowResult
        | RerunWorkflowError,
    )

    expect(result).toEqual({ ok: true })
    expect(calls.reRunWorkflow).toHaveLength(1)
  })
})
