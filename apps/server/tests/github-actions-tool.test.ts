import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnFakeGitHub } from './fakes/github-server'

const fake = await spawnFakeGitHub()

// Minimal Octokit-shaped client that talks to the fake server via fetch.
// Avoids importing @octokit/rest in this test so cross-file mock leakage
// of '@octokit/rest' cannot replace the constructor.
interface FakeOctokit {
  actions: {
    listJobsForWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<{ data: unknown }>
    downloadJobLogsForWorkflowRun: (p: { owner: string; repo: string; job_id: number }) => Promise<{ data: string }>
  }
}

function makeFakeOctokit(baseUrl: string): FakeOctokit {
  const fetchJson = async (path: string): Promise<unknown> => {
    const r = await fetch(`${baseUrl}${path}`)
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} at ${path}`)
    }
    return r.json()
  }
  const fetchText = async (path: string): Promise<string> => {
    const r = await fetch(`${baseUrl}${path}`)
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} ${r.statusText} at ${path}`)
    }
    return r.text()
  }
  return {
    actions: {
      listJobsForWorkflowRun: async ({ owner, repo, run_id }: { owner: string; repo: string; run_id: number }) => ({
        data: await fetchJson(`/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`),
      }),
      downloadJobLogsForWorkflowRun: async ({
        owner,
        repo,
        job_id,
      }: {
        owner: string
        repo: string
        job_id: number
      }) => ({
        data: await fetchText(`/repos/${owner}/${repo}/actions/jobs/${job_id}/logs`),
      }),
    },
  }
}

mock.module('../src/config', () => ({
  config: {
    github: {
      token: 'ghp_test',
      webhook_secret: 'test',
      api_base_url: fake.baseUrl,
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

const { githubActionsTool, setOctokitForTesting } = await import('../src/agent/tools/github-actions')

// Inject the fake-Octokit pointing at the local fake server.
setOctokitForTesting(makeFakeOctokit(fake.baseUrl) as never)

afterAll(async () => {
  await fake.shutdown()
})

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

beforeEach(() => {
  fake.requests.length = 0
  fake.setScenario({})
})

describe('githubActionsTool', () => {
  test('has correct tool description and parameters', () => {
    expect(githubActionsTool.description).toContain('GitHub Actions')
    expect(githubActionsTool.parameters).toBeDefined()
  })

  test('returns error when no failed job found', async () => {
    fake.setScenario({
      jobs: [{ id: 1, name: 'Build', conclusion: 'success', steps: [], started_at: null, completed_at: null }],
    })

    const result = await githubActionsTool.execute({ owner: 'my-org', repo: 'api', runId: 123 }, ctx)
    expect(result).toHaveProperty('error')
  })

  test('fetches logs for failed job and returns last 300 lines', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`)
    fake.setScenario({
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

    const result = await githubActionsTool.execute({ owner: 'my-org', repo: 'api', runId: 123 }, ctx)

    expect(fake.requests[0].path).toBe('/repos/my-org/api/actions/runs/123/jobs')
    expect(fake.requests[1].path).toBe('/repos/my-org/api/actions/jobs/42/logs')
    expect(result.jobName).toBe('Build & Test')
    expect(result.failedStep).toBe('Run tests')
    expect(result.logs.split('\n').length).toBe(300)
    expect(result.logs).toContain('line 201')
    expect(result.durationSeconds).toBe(150)
  })

  test('handles missing step info gracefully', async () => {
    fake.setScenario({
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
      logsByJobId: { 42: 'error: deploy failed' },
    })

    const result = await githubActionsTool.execute({ owner: 'my-org', repo: 'api', runId: 456 }, ctx)

    expect(result.jobName).toBe('Deploy')
    expect(result.failedStep).toBeNull()
    expect(result.durationSeconds).toBeNull()
  })

  test('rejects repos not in the allowlist', async () => {
    const result = await githubActionsTool.execute({ owner: 'evil-org', repo: 'backdoor', runId: 123 }, ctx)

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('not in the monitored repos list')
    expect(fake.requests).toHaveLength(0)
  })

  test('allows repos with different casing than the allowlist', async () => {
    fake.setScenario({
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
      logsByJobId: { 42: 'some log output' },
    })

    const result = await githubActionsTool.execute({ owner: 'My-Org', repo: 'API', runId: 123 }, ctx)

    expect(result.jobName).toBe('Build')
    expect(fake.requests[0].path).toBe('/repos/My-Org/API/actions/runs/123/jobs')
  })

  test('returns error object when API call fails', async () => {
    fake.setScenario({
      listJobsStatus: 429,
      listJobsBody: { message: 'API rate limit exceeded' },
    })

    const result = await githubActionsTool.execute({ owner: 'my-org', repo: 'api', runId: 999 }, ctx)

    expect(result).toHaveProperty('error')
    expect(result.error).toContain('Failed to fetch workflow logs')
  })
})
