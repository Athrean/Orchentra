import { afterAll, describe, test, expect, mock, beforeEach } from 'bun:test'
import { drizzleMockBase } from './helpers/drizzle-mock'
import { dbClientMockBase } from './helpers/db-client-mock'
import { mockBrief, mockIncident } from './fixtures/agent-fixtures'
import { triageWritebackMockBase } from './helpers/triage-writeback-mock'
import { spawnFakeOpenRouter, type ChatCompletionResponse, type ChatCompletionRequest } from './fakes/openrouter-server'

const fake = await spawnFakeOpenRouter()

let dbUpdates: Record<string, unknown>[] = []
let toolCallInserts: Record<string, unknown>[] = []
let githubFinalWrites: { incidentId: string; status: 'brief_ready' | 'error' }[] = []

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: ['my-org/api'] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5', base_url: fake.baseUrl },
  },
}))

mock.module('drizzle-orm', () => ({
  ...drizzleMockBase(),
  eq: (_col: unknown, _val: unknown) => ({}),
  and: (...clauses: unknown[]) => clauses,
  or: (...clauses: unknown[]) => clauses,
  gt: (_col: unknown, _val: unknown) => ({}),
  gte: (_col: unknown, _val: unknown) => ({}),
  lt: (_col: unknown, _val: unknown) => ({}),
  lte: (_col: unknown, _val: unknown) => ({}),
  asc: (col: unknown) => col,
  desc: (col: unknown) => col,
  isNull: (_col: unknown) => ({}),
  isNotNull: (_col: unknown) => ({}),
  inArray: (_col: unknown, _vals: unknown[]) => ({}),
  notInArray: (_col: unknown, _vals: unknown[]) => ({}),
  count: () => 0,
}))

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdates.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
    insert: () => ({
      values: (val: Record<string, unknown>) => {
        toolCallInserts.push(val)
        return Promise.resolve([val])
      },
    }),
  },
  incidents: { id: 'id' },
  toolCalls: {},
  resolvedPatterns: { id: 'id', incidentId: 'incident_id' },
  incidentActions: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
  organizations: {},
  orgMembers: {},
  chatMessages: {},
  webhookEvents: {},
  incidentJobs: {},
}))

mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async () => true,
  getMonitoredRepos: async () => new Set(['my-org/api']),
  invalidateMonitoredReposCache: () => {},
}))

mock.module('../src/agent/patterns', () => ({
  findSimilarPatterns: async () => [],
  formatPatternContext: () => '',
  saveResolvedPattern: async (_incidentId: string) => {},
}))

mock.module('../src/github/triage-writeback', () => ({
  ...triageWritebackMockBase(),
  publishFinalGithubTriage: async (incident: { id: string }, status: 'brief_ready' | 'error'): Promise<void> => {
    githubFinalWrites.push({ incidentId: incident.id, status })
  },
}))

const { setOctokitForTesting } = await import('../src/github/octokit')
const { makeFakeOctokit } = await import('./helpers/fake-octokit')
const { spawnFakeGitHub } = await import('./fakes/github-server')
const ghFake = await spawnFakeGitHub()

ghFake.setScenario({
  jobs: [
    {
      id: 42,
      name: 'Build',
      conclusion: 'failure',
      steps: [{ name: 'Run tests', conclusion: 'failure' }],
      started_at: '2026-04-01T10:00:00Z',
      completed_at: '2026-04-01T10:01:00Z',
    },
  ],
  logsByJobId: { 42: 'TypeError: x is not a function' },
})

setOctokitForTesting(makeFakeOctokit(ghFake.baseUrl) as never)

const { runIncidentAgent } = await import('../src/agent/runner')

afterAll(async () => {
  await fake.shutdown()
  await ghFake.shutdown()
})

// Build the canonical successful run scenario:
//   1. generateText call 1 → tool_call get_workflow_logs
//   2. generateText call 2 → final text
//   3. generateObject (synthesis) → tool_call 'json' returning the brief
//   4. generateObject (patches, since code_bug is actionable) → tool_call 'json' returning patches
function happyPathSelector(req: ChatCompletionRequest): ChatCompletionResponse | null {
  const tools = req.tools ?? []
  const hasJsonTool = tools.some((t) => t.function.name === 'json')

  if (hasJsonTool) {
    // Distinguish brief vs patch by inspecting system message content.
    const systemMsg = req.messages.find((m) => m.role === 'system')
    const systemText = typeof systemMsg?.content === 'string' ? systemMsg.content : ''
    if (systemText.includes('code repair agent')) {
      return {
        toolCalls: [{ name: 'json', args: { patches: [{ path: 'src/fix.ts', action: 'modify', content: 'fixed' }] } }],
        usage: { prompt_tokens: 50, completion_tokens: 25 },
      }
    }
    return {
      toolCalls: [{ name: 'json', args: mockBrief }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }
  }

  // generateText path: first call returns a tool_call, follow-ups return text.
  const lastMsg = req.messages[req.messages.length - 1]
  const lastIsToolResult = lastMsg?.role === 'tool'
  if (lastIsToolResult) {
    return {
      text: 'Based on the logs, the test failed due to a type error.',
      finishReason: 'stop',
    }
  }
  return {
    toolCalls: [{ name: 'get_workflow_logs', args: { owner: 'my-org', repo: 'api', runId: 123 } }],
  }
}

beforeEach(() => {
  dbUpdates = []
  toolCallInserts = []
  githubFinalWrites = []
  fake.requests.length = 0
  fake.setScenario({ selectResponse: happyPathSelector })
})

describe('Agent Runner — ReAct Loop', () => {
  test('issues HTTP calls to LLM during investigation phase', async () => {
    await runIncidentAgent(mockIncident)
    // At least one LLM HTTP call for the investigation phase.
    expect(fake.requests.length).toBeGreaterThanOrEqual(1)
  })

  test('makes synthesis + patch LLM calls', async () => {
    await runIncidentAgent(mockIncident)
    // After agent loop: one HTTP call carrying the synthetic 'json' tool for brief synthesis,
    // and one for patch generation (code_bug is actionable).
    const jsonToolReqs = fake.requests.filter((r) => (r.body.tools ?? []).some((t) => t.function.name === 'json'))
    expect(jsonToolReqs.length).toBe(2)
  })

  test('updates DB with brief and status', async () => {
    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'brief_ready')
    expect(update).toBeDefined()
    expect(update!.rootCause).toBe(mockBrief.rootCause)
    expect(update!.suggestedFix).toBe(mockBrief.suggestedFix)
    expect(update!.confidence).toBe(0.85)
  })

  test('logs tool calls to DB', async () => {
    await runIncidentAgent(mockIncident)
    expect(toolCallInserts.length).toBeGreaterThan(0)
  })

  test('publishes final GitHub triage on success', async () => {
    await runIncidentAgent(mockIncident)
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'brief_ready' })
  })

  test('sets error status on agent failure', async () => {
    fake.setScenario({
      selectResponse: () => ({ httpStatus: 500, httpBody: { error: { message: 'LLM call failed' } } }),
    })

    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'error')
    expect(update).toBeDefined()
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'error' })
  }, 30_000)

  test('falls back to default brief when synthesis fails twice', async () => {
    let synthCalls = 0
    fake.setScenario({
      selectResponse: (req) => {
        const tools = req.tools ?? []
        const hasJsonTool = tools.some((t) => t.function.name === 'json')
        const systemMsg = req.messages.find((m) => m.role === 'system')
        const systemText = typeof systemMsg?.content === 'string' ? systemMsg.content : ''

        if (hasJsonTool && !systemText.includes('code repair agent')) {
          synthCalls++
          return { httpStatus: 500, httpBody: { error: { message: 'schema validation failed' } } }
        }
        return happyPathSelector(req)
      },
    })

    await runIncidentAgent(mockIncident)

    expect(synthCalls).toBeGreaterThanOrEqual(2)
    const update = dbUpdates.find((u) => u.status === 'brief_ready')
    expect(update).toBeDefined()
    const briefJson = JSON.parse(update!.briefJson as string)
    expect(briefJson.failureType).toBe('unknown')
    expect(briefJson.confidence).toBe(0.2)
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'brief_ready' })
    expect(dbUpdates.find((u) => u.status === 'error')).toBeUndefined()
  }, 30_000)
})
