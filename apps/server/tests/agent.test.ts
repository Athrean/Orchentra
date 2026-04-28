import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { dbClientMockBase } from './helpers/db-client-mock'
import { mockStepData, mockGenerateTextResponse, mockBrief, mockIncident } from './fixtures/agent-fixtures'
import { aiMockBase } from './helpers/ai-mock'
import { llmMockBase } from './helpers/llm-mock'

let generateTextCalls: unknown[] = []
let generateObjectCalls: unknown[] = []
let dbUpdates: Record<string, unknown>[] = []
let toolCallInserts: Record<string, unknown>[] = []
let githubFinalWrites: { incidentId: string; status: 'brief_ready' | 'error' }[] = []
let shouldThrowOnGenerate = false
let generateObjectFailuresRemaining = 0

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: ['my-org/api'] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

mock.module('drizzle-orm', () => ({
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

mock.module('ai', () => ({
  ...aiMockBase(),
  tool: (definition: unknown) => definition,
  generateText: async (opts: {
    onStepFinish?: (step: typeof mockStepData) => Promise<void>
    [key: string]: unknown
  }) => {
    generateTextCalls.push(opts)
    if (shouldThrowOnGenerate) throw new Error('LLM call failed')
    if (opts.onStepFinish) {
      await opts.onStepFinish(mockStepData)
    }
    return mockGenerateTextResponse
  },
  generateObject: async (opts: { system?: string }) => {
    generateObjectCalls.push(opts)
    if (generateObjectFailuresRemaining > 0) {
      generateObjectFailuresRemaining--
      throw new Error('schema validation failed')
    }
    // Patch generation uses a system prompt containing "code repair agent"
    if (opts.system?.includes('code repair agent')) {
      return {
        object: { patches: [{ path: 'src/fix.ts', action: 'modify' as const, content: 'fixed' }] },
        usage: { promptTokens: 50, completionTokens: 25 },
      }
    }
    return { object: mockBrief, usage: { promptTokens: 100, completionTokens: 50 } }
  },
}))

mock.module('../src/agent/llm', () => ({
  ...llmMockBase(),
  createModel: () => ({ modelId: 'anthropic/claude-sonnet-4-5' }),
  createEmbeddingModel: () => ({ modelId: 'text-embedding-3-small' }),
}))

mock.module('../src/agent/patterns', () => ({
  findSimilarPatterns: async () => [],
  formatPatternContext: () => '',
  saveResolvedPattern: async (_incidentId: string) => {},
}))

mock.module('../src/agent/tools/github-actions', () => ({
  githubActionsTool: {
    description: 'mock tool',
    parameters: {},
    execute: async () => ({ jobName: 'Build', logs: 'error', failedStep: 'test' }),
  },
}))

mock.module('../src/github/triage-writeback', () => ({
  publishFinalGithubTriage: async (incident: { id: string }, status: 'brief_ready' | 'error'): Promise<void> => {
    githubFinalWrites.push({ incidentId: incident.id, status })
  },
}))

const { runIncidentAgent } = await import('../src/agent/runner')

beforeEach(() => {
  generateTextCalls = []
  generateObjectCalls = []
  dbUpdates = []
  toolCallInserts = []
  githubFinalWrites = []
  shouldThrowOnGenerate = false
  generateObjectFailuresRemaining = 0
})

describe('Agent Runner — ReAct Loop', () => {
  test('calls generateText for investigation phase', async () => {
    await runIncidentAgent(mockIncident)
    expect(generateTextCalls.length).toBe(1)
  })

  test('calls generateObject for synthesis and patch generation', async () => {
    await runIncidentAgent(mockIncident)
    // First call: synthesis (brief), second call: patch generation (code_bug is actionable)
    expect(generateObjectCalls.length).toBe(2)
  })

  test('passes tool results to synthesis phase', async () => {
    await runIncidentAgent(mockIncident)

    const synthCall = generateObjectCalls[0] as { messages: { role: string; content: string }[] }
    expect(synthCall.messages).toBeDefined()
    expect(synthCall.messages.length).toBeGreaterThan(0)
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
    shouldThrowOnGenerate = true
    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'error')
    expect(update).toBeDefined()
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'error' })
  })

  test('retries generateObject once on failure and recovers', async () => {
    generateObjectFailuresRemaining = 1
    await runIncidentAgent(mockIncident)

    // 2 synthesis calls (1 fail + 1 retry) + 1 patch generation = 3
    expect(generateObjectCalls.length).toBe(3)
    const update = dbUpdates.find((u) => u.status === 'brief_ready')
    expect(update).toBeDefined()
    expect(update!.rootCause).toBe(mockBrief.rootCause)
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'brief_ready' })
  })

  test('falls back to default brief when generateObject fails twice', async () => {
    generateObjectFailuresRemaining = 2
    await runIncidentAgent(mockIncident)

    expect(generateObjectCalls.length).toBe(2)
    const update = dbUpdates.find((u) => u.status === 'brief_ready')
    expect(update).toBeDefined()
    // Fallback brief is identifiable by failureType 'unknown' and confidence 0.2
    const briefJson = JSON.parse(update!.briefJson as string)
    expect(briefJson.failureType).toBe('unknown')
    expect(briefJson.confidence).toBe(0.2)
    // Incident should still publish a successful triage, not error
    expect(githubFinalWrites).toContainEqual({ incidentId: 'test-incident-1', status: 'brief_ready' })
    // No error update should be issued
    expect(dbUpdates.find((u) => u.status === 'error')).toBeUndefined()
  })
})
