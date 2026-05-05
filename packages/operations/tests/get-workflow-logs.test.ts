import { afterEach, describe, expect, test } from 'bun:test'
import { dispatch, type OperationContext } from '../src'
import {
  getWorkflowLogsOperation,
  type GetWorkflowLogsResult,
  type WorkflowLogResult,
} from '../src/ops/github/get-workflow-logs'
import { setGitHubAdapter, type GitHubAdapter, type GitHubJob, type ListJobsResult } from '../src/ops/github/adapter'

interface FakeAdapterCalls {
  isRepoAllowed: string[]
  listJobs: Array<{ owner: string; repo: string; runId: number }>
  downloadLogs: Array<{ owner: string; repo: string; jobId: number }>
}

function fakeAdapter(opts: {
  allowed?: Set<string>
  jobs?: GitHubJob[]
  logsByJobId?: Record<number, string>
  listJobsThrows?: Error
}): { adapter: GitHubAdapter; calls: FakeAdapterCalls } {
  const calls: FakeAdapterCalls = { isRepoAllowed: [], listJobs: [], downloadLogs: [] }
  const allowed = opts.allowed ?? new Set(['my-org/api'])
  const jobs = opts.jobs ?? []
  const logsByJobId = opts.logsByJobId ?? {}
  return {
    adapter: {
      isRepoAllowed: async (fullName: string) => {
        calls.isRepoAllowed.push(fullName)
        return allowed.has(fullName.toLowerCase())
      },
      listJobsForWorkflowRun: async (input): Promise<ListJobsResult> => {
        calls.listJobs.push(input)
        if (opts.listJobsThrows) throw opts.listJobsThrows
        return { jobs }
      },
      downloadJobLogs: async (input) => {
        calls.downloadLogs.push(input)
        return logsByJobId[input.jobId] ?? ''
      },
    },
    calls,
  }
}

const ctx: OperationContext = { remote: false, allowedScopes: new Set(['read']) }

afterEach(() => setGitHubAdapter(null))

function ok(result: GetWorkflowLogsResult): WorkflowLogResult {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`)
  return result
}

describe('get_workflow_logs operation', () => {
  test('rejects repos not in the allowlist', async () => {
    const { adapter } = fakeAdapter({ allowed: new Set(['my-org/api']) })
    setGitHubAdapter(adapter)
    const result = await dispatch(getWorkflowLogsOperation, ctx, {
      owner: 'evil-org',
      repo: 'backdoor',
      runId: 1,
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('not in the monitored repos list')
    }
  })

  test('returns error when no failed job is present', async () => {
    const { adapter } = fakeAdapter({
      jobs: [
        {
          id: 1,
          name: 'Build',
          conclusion: 'success',
          steps: [],
          started_at: null,
          completed_at: null,
        },
      ],
    })
    setGitHubAdapter(adapter)
    const result = await dispatch(getWorkflowLogsOperation, ctx, {
      owner: 'my-org',
      repo: 'api',
      runId: 1,
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('No failed job')
    }
  })

  test('fetches logs for failed job and returns last 300 lines', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`)
    const { adapter, calls } = fakeAdapter({
      jobs: [
        {
          id: 42,
          name: 'Build & Test',
          conclusion: 'failure',
          steps: [
            { name: 'Checkout', conclusion: 'success' },
            { name: 'Run tests', conclusion: 'failure' },
          ],
          started_at: '2026-03-24T10:00:00Z',
          completed_at: '2026-03-24T10:02:30Z',
        },
      ],
      logsByJobId: { 42: lines.join('\n') },
    })
    setGitHubAdapter(adapter)

    const result = ok(await dispatch(getWorkflowLogsOperation, ctx, { owner: 'my-org', repo: 'api', runId: 123 }))

    expect(calls.listJobs[0]).toEqual({ owner: 'my-org', repo: 'api', runId: 123 })
    expect(calls.downloadLogs[0]).toEqual({ owner: 'my-org', repo: 'api', jobId: 42 })
    expect(result.jobName).toBe('Build & Test')
    expect(result.failedStep).toBe('Run tests')
    expect(result.logs.split('\n').length).toBe(300)
    expect(result.logs).toContain('line 201')
    expect(result.durationSeconds).toBe(150)
  })

  test('returns null durationSeconds and failedStep when fields are missing', async () => {
    const { adapter } = fakeAdapter({
      jobs: [
        {
          id: 7,
          name: 'Deploy',
          conclusion: 'failure',
          steps: [],
          started_at: null,
          completed_at: null,
        },
      ],
      logsByJobId: { 7: 'error: deploy failed' },
    })
    setGitHubAdapter(adapter)
    const result = ok(await dispatch(getWorkflowLogsOperation, ctx, { owner: 'my-org', repo: 'api', runId: 9 }))
    expect(result.failedStep).toBeNull()
    expect(result.durationSeconds).toBeNull()
  })

  test('treats timed_out / cancelled / action_required jobs as failed', async () => {
    for (const conclusion of ['timed_out', 'cancelled', 'action_required'] as const) {
      const { adapter } = fakeAdapter({
        jobs: [
          {
            id: 11,
            name: `${conclusion} job`,
            conclusion,
            steps: [{ name: 'main', conclusion }],
            started_at: null,
            completed_at: null,
          },
        ],
        logsByJobId: { 11: 'log line' },
      })
      setGitHubAdapter(adapter)
      const result = ok(await dispatch(getWorkflowLogsOperation, ctx, { owner: 'my-org', repo: 'api', runId: 1 }))
      expect(result.jobName).toBe(`${conclusion} job`)
      expect(result.failedStep).toBe('main')
    }
  })

  test('skips in_progress (conclusion: null) jobs when matching failed', async () => {
    const { adapter } = fakeAdapter({
      jobs: [
        { id: 1, name: 'Running', conclusion: null, steps: [], started_at: null, completed_at: null },
        { id: 2, name: 'TimedOut', conclusion: 'timed_out', steps: [], started_at: null, completed_at: null },
      ],
      logsByJobId: { 2: 'timeout log' },
    })
    setGitHubAdapter(adapter)
    const result = ok(await dispatch(getWorkflowLogsOperation, ctx, { owner: 'my-org', repo: 'api', runId: 1 }))
    expect(result.jobName).toBe('TimedOut')
  })

  test('returns error object when upstream throws', async () => {
    const { adapter } = fakeAdapter({ listJobsThrows: new Error('rate limit exceeded') })
    setGitHubAdapter(adapter)
    const result = await dispatch(getWorkflowLogsOperation, ctx, {
      owner: 'my-org',
      repo: 'api',
      runId: 999,
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Failed to fetch workflow logs')
      expect(result.error).toContain('rate limit')
    }
  })
})
