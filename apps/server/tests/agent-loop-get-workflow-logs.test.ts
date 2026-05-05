import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { spawnFakeGitHub } from './fakes/github-server'

const fake = await spawnFakeGitHub()

interface FakeOctokit {
  actions: {
    listJobsForWorkflowRun: (p: { owner: string; repo: string; run_id: number }) => Promise<{ data: unknown }>
    downloadJobLogsForWorkflowRun: (p: { owner: string; repo: string; job_id: number }) => Promise<{ data: string }>
  }
}

function makeFakeOctokit(baseUrl: string): FakeOctokit {
  const fetchJson = async (path: string): Promise<unknown> => {
    const r = await fetch(`${baseUrl}${path}`)
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} at ${path}`)
    return r.json()
  }
  const fetchText = async (path: string): Promise<string> => {
    const r = await fetch(`${baseUrl}${path}`)
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} at ${path}`)
    return r.text()
  }
  return {
    actions: {
      listJobsForWorkflowRun: async ({ owner, repo, run_id }) => ({
        data: await fetchJson(`/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`),
      }),
      downloadJobLogsForWorkflowRun: async ({ owner, repo, job_id }) => ({
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

const { setOctokitForTesting } = await import('../src/github/octokit')
const { ToolRegistry } = await import('../src/agent/tool-registry')
const { registerBuiltinTools } = await import('../src/agent/tools/builtin')
const { fetchFailedJobLogs } = await import('../src/agent/tools/github-actions')

setOctokitForTesting(makeFakeOctokit(fake.baseUrl) as never)

afterAll(async () => fake.shutdown())

const ctx = { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal }

beforeEach(() => {
  fake.requests.length = 0
  fake.setScenario({})
})

describe('in-process agent loop calls get_workflow_logs unchanged after operations migration', () => {
  test('tool exposed via ToolRegistry returns the same shape as the direct re-export', async () => {
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
      logsByJobId: { 42: 'compile error\nat line 17' },
    })

    const registry = new ToolRegistry()
    registerBuiltinTools(registry)

    const tools = registry.getTools(new Set(['read']))
    expect(tools.get_workflow_logs).toBeDefined()

    const viaRegistry = await tools.get_workflow_logs.execute!({ owner: 'my-org', repo: 'api', runId: 123 }, ctx)

    fake.requests.length = 0
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
      logsByJobId: { 42: 'compile error\nat line 17' },
    })
    const viaDirect = await fetchFailedJobLogs('my-org', 'api', 123)

    expect(viaRegistry).toEqual(viaDirect)
    if ('jobName' in (viaDirect as Record<string, unknown>)) {
      const result = viaDirect as {
        jobName: string
        failedStep: string | null
        logs: string
        durationSeconds: number | null
      }
      expect(result.jobName).toBe('Build & Test')
      expect(result.failedStep).toBe('Run tests')
      expect(result.durationSeconds).toBe(150)
    }
  })

  test('repo allowlist still gates the in-process loop call', async () => {
    const registry = new ToolRegistry()
    registerBuiltinTools(registry)
    const tools = registry.getTools(new Set(['read']))

    const result = (await tools.get_workflow_logs.execute!({ owner: 'evil-org', repo: 'backdoor', runId: 1 }, ctx)) as {
      error?: string
    }
    expect(result.error).toContain('not in the monitored repos list')
    expect(fake.requests.length).toBe(0)
  })
})
