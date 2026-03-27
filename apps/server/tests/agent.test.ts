import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { mockStepData, mockGenerateTextResponse, mockBrief, mockIncident } from './fixtures/agent-fixtures'

let generateTextCalls: unknown[] = []
let generateObjectCalls: unknown[] = []
let dbUpdates: Record<string, unknown>[] = []
let slackBriefUpdates: { incidentId: string; brief: unknown }[] = []
let slackThreadReplies: { incidentId: string; text: string }[] = []
let toolCallInserts: Record<string, unknown>[] = []
let shouldThrowOnGenerate = false

mock.module('../src/config', () => ({
  config: {
    github: { token: 'ghp_test', webhook_secret: 'test', repos: ['my-org/api'] },
    llm: { api_key: 'sk-or-test', model: 'anthropic/claude-sonnet-4-5' },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
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
}))

mock.module('../src/slack/message', () => ({
  updateSlackWithBrief: async (incidentId: string, brief: unknown) => {
    slackBriefUpdates.push({ incidentId, brief })
  },
  postThreadReply: async (incidentId: string, text: string) => {
    slackThreadReplies.push({ incidentId, text })
  },
}))

mock.module('ai', () => ({
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
}))

mock.module('../src/agent/tools/github-actions', () => ({
  githubActionsTool: {
    description: 'mock tool',
    parameters: {},
    execute: async () => ({ jobName: 'Build', logs: 'error', failedStep: 'test' }),
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

  test('sets error status on agent failure', async () => {
    shouldThrowOnGenerate = true
    await runIncidentAgent(mockIncident)

    const update = dbUpdates.find((u) => u.status === 'error')
    expect(update).toBeDefined()
  })
})
