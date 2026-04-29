import { afterAll, describe, test, expect, mock } from 'bun:test'
import { spawnFakeGitHub } from './fakes/github-server'
import { makeFakeOctokit } from './helpers/fake-octokit'

const MONITORED_REPO = 'owner/repo'

const fake = await spawnFakeGitHub()

const mockWorkflows = [
  { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
  { id: 2, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' },
]

const mockRuns = [
  {
    id: 100,
    workflow_id: 1,
    name: 'CI',
    head_branch: 'main',
    head_sha: 'abc1234',
    status: 'completed',
    conclusion: 'success',
    run_number: 42,
    event: 'push',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:05:00Z',
    html_url: 'https://github.com/owner/repo/actions/runs/100',
  },
]

fake.setScenario({
  routes: {
    'GET /repos/:owner/:repo/actions/workflows': (c) => c.json({ workflows: mockWorkflows }),
    'GET /repos/:owner/:repo/actions/runs': (c) => c.json({ workflow_runs: mockRuns }),
    'POST /repos/:owner/:repo/actions/workflows/:workflowId/dispatches': (c) => c.json({}, 204),
    'POST /repos/:owner/:repo/actions/runs/:runId/cancel': (c) => c.json({}, 202),
  },
})

mock.module('../src/config', () => ({
  config: {
    github: { token: 'test-token', api_base_url: fake.baseUrl },
    llm: { api_key: 'k', model: 'm', embedding_model: 'e' },
  },
}))

const { setOctokitForTesting } = await import('../src/github/octokit')
const { listWorkflows, listWorkflowRuns, dispatchWorkflow, cancelWorkflowRun } =
  await import('../src/lib/github-workflows')

setOctokitForTesting(makeFakeOctokit(fake.baseUrl) as never)

afterAll(async () => {
  await fake.shutdown()
})

describe('listWorkflows', () => {
  test('returns workflow array for a valid repo', async () => {
    const result = await listWorkflows(MONITORED_REPO)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.length).toBe(2)
      expect(result[0].name).toBe('CI')
      expect(result[0].id).toBe(1)
    }
  })

  test('enriches workflows with latest run conclusion', async () => {
    const result = await listWorkflows(MONITORED_REPO)
    if (!('error' in result)) {
      const ci = result.find((w) => w.id === 1)
      expect(ci?.latestConclusion).toBe('success')
      expect(ci?.latestRunAt).toBe('2026-04-01T10:00:00Z')
    }
  })

  test('returns error for invalid repo format', async () => {
    const result = await listWorkflows('not-valid')
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.status).toBe(400)
  })
})

describe('listWorkflowRuns', () => {
  test('returns runs for a valid workflow', async () => {
    const result = await listWorkflowRuns(MONITORED_REPO, 1)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result[0].id).toBe(100)
      expect(result[0].runNumber).toBe(42)
      expect(result[0].conclusion).toBe('success')
    }
  })

  test('calculates durationSeconds from created/updated timestamps', async () => {
    const result = await listWorkflowRuns(MONITORED_REPO, 1)
    if (!('error' in result)) {
      expect(result[0].durationSeconds).toBe(300)
    }
  })
})

describe('dispatchWorkflow', () => {
  test('returns ok:true on success', async () => {
    const result = await dispatchWorkflow(MONITORED_REPO, 1, 'main')
    expect(result).toEqual({ ok: true })
  })

  test('returns error for invalid repo format', async () => {
    const result = await dispatchWorkflow('bad', 1, 'main')
    expect('error' in result).toBe(true)
  })
})

describe('cancelWorkflowRun', () => {
  test('returns ok:true on success', async () => {
    const result = await cancelWorkflowRun(MONITORED_REPO, 100)
    expect(result).toEqual({ ok: true })
  })

  test('returns error for invalid repo format', async () => {
    const result = await cancelWorkflowRun('bad', 100)
    expect('error' in result).toBe(true)
  })
})
