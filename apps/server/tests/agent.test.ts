import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { mockStepData, mockGenerateTextResponse, mockBrief, mockIncident } from './fixtures/agent-fixtures'

let generateTextCalls: unknown[] = []
let generateObjectCalls: unknown[] = []
let dbUpdates: Record<string, unknown>[] = []
let slackBriefUpdates: { incidentId: string; brief: unknown }[] = []
let slackThreadReplies: { incidentId: string; text: string }[] = []
let toolCallInserts: Record<string, unknown>[] = []
let githubFinalWrites: { incidentId: string; status: 'brief_ready' | 'error' }[] = []
let shouldThrowOnGenerate = false

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

mock.module('../src/slack/message', () => ({
  updateSlackWithBrief: async (incidentId: string, brief: unknown) => {
    slackBriefUpdates.push({ incidentId, brief })
  },
  updateSlackToFixing: async (_id: string, _brief: unknown, _statusText: string, _performedBy: string | null) => {},
  updateSlackToResolved: async (_id: string, _reason: string, _mttrSeconds: number | null) => {},
  postThreadReply: async (incidentId: string, text: string) => {
    slackThreadReplies.push({ incidentId, text })
  },
}))

mock.module('ai', () => ({
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
  generateObject: async (opts: unknown) => {
    generateObjectCalls.push(opts)
    return { object: mockBrief }
  },
}))

mock.module('../src/agent/llm', () => ({
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
  slackBriefUpdates = []
  slackThreadReplies = []
  toolCallInserts = []
  githubFinalWrites = []
  shouldThrowOnGenerate = false
})

describe('Agent Runner — ReAct Loop', () => {
  test('calls generateText for investigation phase', async () => {
    await runIncidentAgent(mockIncident)
    expect(generateTextCalls.length).toBe(1)
  })

  test('calls generateObject for synthesis phase', async () => {
    await runIncidentAgent(mockIncident)
    expect(generateObjectCalls.length).toBe(1)
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

  test('updates Slack with brief', async () => {
    await runIncidentAgent(mockIncident)

    expect(slackBriefUpdates.length).toBe(1)
    expect(slackBriefUpdates[0].incidentId).toBe('test-incident-1')
  })

  test('logs tool calls to DB', async () => {
    await runIncidentAgent(mockIncident)
    expect(toolCallInserts.length).toBeGreaterThan(0)
  })

  test('posts tool trace as thread reply', async () => {
    await runIncidentAgent(mockIncident)
    expect(slackThreadReplies.length).toBeGreaterThan(0)
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
})
