import { describe, test, expect, mock, beforeEach } from 'bun:test'

// Tracking
let dbUpdates: Record<string, unknown>[] = []
let slackUpdates: { incidentId: string; brief: unknown }[] = []
let generateObjectCalls: unknown[] = []

const mockBrief = {
  failureType: 'code_bug' as const,
  summary: 'TypeScript compilation failed due to type mismatch in auth module',
  rootCause: 'Type error in src/auth/login.ts — string passed where number expected',
  suggestedFix: 'Change line 42 in src/auth/login.ts: userId should be parseInt(rawId)',
  confidence: 0.85,
  similarIncidentId: null,
}

mock.module('../src/config', () => ({
  config: {
    llm: {
      provider: 'anthropic',
      api_key: 'sk-ant-test',
      model: 'claude-sonnet-4-5',
    },
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
  },
  incidents: { id: 'id' },
}))

mock.module('../src/slack/message', () => ({
  updateSlackWithBrief: async (incidentId: string, brief: unknown) => {
    slackUpdates.push({ incidentId, brief })
  },
}))

mock.module('ai', () => ({
  generateObject: async (opts: unknown) => {
    generateObjectCalls.push(opts)
    return { object: mockBrief }
  },
}))

mock.module('@ai-sdk/anthropic', () => ({
  anthropic: (model: string) => ({ modelId: model }),
}))

const { runIncidentAgent } = await import('../src/agent/runner')

const mockIncident = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI / Build & Test',
  workflowRunId: 12345,
  failedStep: null,
  status: 'investigating' as const,
  briefJson: null,
  confidence: null,
  rootCause: null,
  suggestedFix: null,
  slackChannel: '#test',
  slackMessageTs: '1234567890.123456',
  triggeredAt: new Date(),
  resolvedAt: null,
  mttrSeconds: null,
  createdAt: new Date(),
}

beforeEach(() => {
  dbUpdates = []
  slackUpdates = []
  generateObjectCalls = []
})

describe('Agent Runner', () => {
  test('calls generateObject with correct model and schema', async () => {
    await runIncidentAgent(mockIncident)

    expect(generateObjectCalls.length).toBe(1)
  })

  test('updates DB with brief, root cause, and status', async () => {
    await runIncidentAgent(mockIncident)

    const update = dbUpdates[0]
    expect(update).toBeDefined()
    expect(update.status).toBe('brief_ready')
    expect(update.rootCause).toBe(mockBrief.rootCause)
    expect(update.suggestedFix).toBe(mockBrief.suggestedFix)
    expect(update.confidence).toBe(0.85)

    const stored = JSON.parse(update.briefJson as string)
    expect(stored.failureType).toBe('code_bug')
    expect(stored.summary).toBe(mockBrief.summary)
  })

  test('updates Slack message with brief', async () => {
    await runIncidentAgent(mockIncident)

    expect(slackUpdates.length).toBe(1)
    expect(slackUpdates[0].incidentId).toBe('test-incident-1')
    expect(slackUpdates[0].brief).toEqual(mockBrief)
  })

  test('sets ANTHROPIC_API_KEY from config', async () => {
    await runIncidentAgent(mockIncident)
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test')
  })
})
