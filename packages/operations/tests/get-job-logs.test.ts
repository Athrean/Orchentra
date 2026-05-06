import { beforeEach, describe, expect, test } from 'bun:test'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '../src/adapters/github'
import { getJobLogsOperation, type GetJobLogsResult, type GetJobLogsError } from '../src/ops/github/get-job-logs'
import { dispatch, OperationError, type OperationContext } from '../src'

const localCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read', 'write', 'admin']),
}

interface ActionsOverrides {
  downloadJobLogsForWorkflowRun?: GithubAdapter['actions']['downloadJobLogsForWorkflowRun']
}

function fakeAdapter(actions: ActionsOverrides = {}): {
  adapter: GithubAdapter
  calls: {
    downloadJobLogsForWorkflowRun: Array<Parameters<GithubAdapter['actions']['downloadJobLogsForWorkflowRun']>[0]>
  }
} {
  const calls: {
    downloadJobLogsForWorkflowRun: Array<Parameters<GithubAdapter['actions']['downloadJobLogsForWorkflowRun']>[0]>
  } = { downloadJobLogsForWorkflowRun: [] }
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
        listJobsForWorkflowRun: () => Promise.reject(new Error('not used')),
        downloadJobLogsForWorkflowRun:
          actions.downloadJobLogsForWorkflowRun ??
          (async (params) => {
            calls.downloadJobLogsForWorkflowRun.push(params)
            return { data: 'tiny log payload' }
          }),
      },
    },
    calls,
  }
}

function ok(result: GetJobLogsResult | GetJobLogsError): GetJobLogsResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('get_job_logs operation', () => {
  beforeEach(() => {
    setRepoMonitoredCheck(async (fullName) => fullName === 'my-org/api')
  })

  test('handler returns small string logs unchanged with truncated:false', async () => {
    const { adapter, calls } = fakeAdapter()
    setGithubAdapter(adapter)

    const result = ok(await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId: 42 }))

    expect(result.logs).toBe('tiny log payload')
    expect(result.truncated).toBe(false)
    expect(calls.downloadJobLogsForWorkflowRun[0]).toEqual({ owner: 'my-org', repo: 'api', job_id: 42 })
  })

  test('handler decodes ArrayBuffer payloads as utf-8', async () => {
    setGithubAdapter(
      fakeAdapter({
        downloadJobLogsForWorkflowRun: async () => {
          const bytes = new TextEncoder().encode('binary-shaped log line')
          return { data: bytes.buffer }
        },
      }).adapter,
    )

    const result = ok(await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId: 1 }))
    expect(result.logs).toBe('binary-shaped log line')
    expect(result.truncated).toBe(false)
  })

  test('handler decodes Buffer payloads as utf-8', async () => {
    setGithubAdapter(
      fakeAdapter({
        downloadJobLogsForWorkflowRun: async () => ({ data: Buffer.from('buffer log line', 'utf-8') }),
      }).adapter,
    )

    const result = ok(await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId: 1 }))
    expect(result.logs).toBe('buffer log line')
    expect(result.truncated).toBe(false)
  })

  test('handler truncates payloads larger than 1MB and flags truncated:true', async () => {
    // 1.5 MB payload of ASCII chars (ASCII is 1 byte per char, so length === bytes).
    const oneMb = 1_048_576
    const big = 'x'.repeat(oneMb + 100_000) + 'TAIL_MARKER'
    setGithubAdapter(
      fakeAdapter({
        downloadJobLogsForWorkflowRun: async () => ({ data: big }),
      }).adapter,
    )

    const result = ok(await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId: 7 }))

    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.logs, 'utf-8')).toBe(oneMb)
    // Tail preservation: the last bytes (incl. our marker) must survive.
    expect(result.logs.endsWith('TAIL_MARKER')).toBe(true)
  })

  test('handler keeps payloads at exactly 1MB intact (truncated:false)', async () => {
    const oneMb = 1_048_576
    const exact = 'a'.repeat(oneMb)
    setGithubAdapter(
      fakeAdapter({
        downloadJobLogsForWorkflowRun: async () => ({ data: exact }),
      }).adapter,
    )

    const result = ok(await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId: 1 }))

    expect(result.truncated).toBe(false)
    expect(result.logs.length).toBe(oneMb)
  })

  test('handler rejects unmonitored repo', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    const result = (await getJobLogsOperation.handler(localCtx, {
      owner: 'evil',
      repo: 'corp',
      jobId: 1,
    })) as GetJobLogsError

    expect(result.error).toContain('not monitored')
  })

  test('handler returns error object when adapter throws', async () => {
    setGithubAdapter(
      fakeAdapter({
        downloadJobLogsForWorkflowRun: () => Promise.reject(new Error('Not Found')),
      }).adapter,
    )

    const result = (await getJobLogsOperation.handler(localCtx, {
      owner: 'my-org',
      repo: 'api',
      jobId: 999,
    })) as GetJobLogsError

    expect(result.error).toContain('Failed to fetch job logs')
    expect(result.error).toContain('Not Found')
  })

  test('dispatch rejects malformed input with OperationError(invalid_input)', async () => {
    setGithubAdapter(fakeAdapter().adapter)

    let captured: unknown
    try {
      await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api' })
    } catch (err) {
      captured = err
    }

    expect(captured).toBeInstanceOf(OperationError)
    expect((captured as OperationError).code).toBe('invalid_input')
  })

  test('dispatch rejects non-positive or non-integer jobId', async () => {
    setGithubAdapter(fakeAdapter().adapter)
    for (const jobId of [0, -1, 1.5]) {
      let captured: unknown
      try {
        await dispatch(getJobLogsOperation, localCtx, { owner: 'my-org', repo: 'api', jobId })
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(OperationError)
      expect((captured as OperationError).code).toBe('invalid_input')
    }
  })

  test('operation metadata is read-scoped, non-mutating, non-localOnly', () => {
    expect(getJobLogsOperation.id).toBe('get_job_logs')
    expect(getJobLogsOperation.scope).toBe('read')
    expect(getJobLogsOperation.mutating).toBe(false)
    expect(getJobLogsOperation.localOnly).toBe(false)
  })
})
