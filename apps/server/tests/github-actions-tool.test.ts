import { describe, test, expect, mock, beforeEach } from 'bun:test'

let listJobsCalls: { owner: string; repo: string; run_id: number }[] = []
let downloadLogsCalls: { owner: string; repo: string; job_id: number }[] = []
let mockJobs: { jobs: Record<string, unknown>[] } = { jobs: [] }
let mockLogsData: string | ArrayBuffer = ''
let mockListJobsError: Error | null = null

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      repos: ['my-org/api'],
    },
  },
}))

const monitoredSet = new Set(['my-org/api'])

mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async (fullName: string) => monitoredSet.has(fullName.toLowerCase()),
  getMonitoredRepos: async () => monitoredSet,
  invalidateMonitoredReposCache: () => {},
}))

mock.module('@octokit/rest', () => ({
  Octokit: class {
    actions = {
      listJobsForWorkflowRun: async (params: { owner: string; repo: string; run_id: number }) => {
        listJobsCalls.push(params)
        if (mockListJobsError) throw mockListJobsError
        return { data: mockJobs }
      },
      downloadJobLogsForWorkflowRun: async (params: { owner: string; repo: string; job_id: number }) => {
        downloadLogsCalls.push(params)
        return { data: mockLogsData }
      },
    }
  },
}))

const { githubActionsTool } = await import('../src/agent/tools/github-actions')

beforeEach(() => {
  listJobsCalls = []
  downloadLogsCalls = []
  mockJobs = { jobs: [] }
  mockLogsData = ''
  mockListJobsError = null
})

describe('githubActionsTool', () => {
  test('has correct tool description and parameters', () => {
    expect(githubActionsTool.description).toContain('GitHub Actions')
    expect(githubActionsTool.parameters).toBeDefined()
  })

  test('returns error when no failed job found', async () => {
    mockJobs = {
      jobs: [{ id: 1, name: 'Build', conclusion: 'success', steps: [], started_at: null, completed_at: null }],
    }

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )
    expect(result).toHaveProperty('error')
  })

  test('fetches logs for failed job and returns last 300 lines', async () => {
    mockJobs = {
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
    }
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`)
    mockLogsData = lines.join('\n')

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(listJobsCalls[0]).toEqual({ owner: 'my-org', repo: 'api', run_id: 123 })
    expect(downloadLogsCalls[0]).toEqual({ owner: 'my-org', repo: 'api', job_id: 42 })
    expect(result.jobName).toBe('Build & Test')
    expect(result.failedStep).toBe('Run tests')
    expect(result.logs.split('\n').length).toBe(300)
    expect(result.logs).toContain('line 201')
    expect(result.durationSeconds).toBe(150)
  })

  test('handles missing step info gracefully', async () => {
    mockJobs = {
      jobs: [
        {
          id: 42,
          name: 'Deploy',
          conclusion: 'failure',
          steps: [],
          started_at: null,
          completed_at: null,
        },
      ],
    }
    mockLogsData = 'error: deploy failed'

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 456 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result.jobName).toBe('Deploy')
    expect(result.failedStep).toBeNull()
    expect(result.durationSeconds).toBeNull()
  })

  test('rejects repos not in the allowlist', async () => {
    const result = await githubActionsTool.execute(
      { owner: 'evil-org', repo: 'backdoor', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('not in the monitored repos list')
    expect(listJobsCalls).toHaveLength(0)
  })

  test('allows repos with different casing than the allowlist', async () => {
    mockJobs = {
      jobs: [
        {
          id: 42,
          name: 'Build',
          conclusion: 'failure',
          steps: [{ name: 'Test', conclusion: 'failure' }],
          started_at: '2026-03-24T10:00:00Z',
          completed_at: '2026-03-24T10:01:00Z',
        },
      ],
    }
    mockLogsData = 'some log output'

    const result = await githubActionsTool.execute(
      { owner: 'My-Org', repo: 'API', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result.jobName).toBe('Build')
    expect(listJobsCalls[0]).toEqual({ owner: 'My-Org', repo: 'API', run_id: 123 })
  })

  test('decodes binary ArrayBuffer log data', async () => {
    mockJobs = {
      jobs: [
        {
          id: 42,
          name: 'Build',
          conclusion: 'failure',
          steps: [{ name: 'Test', conclusion: 'failure' }],
          started_at: '2026-03-24T10:00:00Z',
          completed_at: '2026-03-24T10:01:00Z',
        },
      ],
    }
    const logText = 'error: test failed\nassert false'
    mockLogsData = new TextEncoder().encode(logText).buffer as ArrayBuffer

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 123 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result.logs).toBe(logText)
  })

  test('returns error object when API call fails', async () => {
    mockListJobsError = new Error('API rate limit exceeded')

    const result = await githubActionsTool.execute(
      { owner: 'my-org', repo: 'api', runId: 999 },
      { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal },
    )

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to fetch workflow logs')
    expect(result.error).toContain('API rate limit exceeded')
  })
})
