import { describe, test, expect, mock, beforeEach } from 'bun:test'

let generateTextCalls: unknown[] = []
let generateObjectCalls: unknown[] = []
let dbUpdates: Record<string, unknown>[] = []
let slackBriefUpdates: { incidentId: string; brief: unknown }[] = []
let slackThreadReplies: { incidentId: string; text: string }[] = []
let toolCallInserts: Record<string, unknown>[] = []
let shouldThrowOnGenerate = false
const mockStepData = {
  toolCalls: [{ toolName: 'get_workflow_logs', args: { owner: 'my-org', repo: 'api', runId: 123 } }],
  toolResults: [
    {
      toolName: 'get_workflow_logs',
      result: { jobName: 'Build', logs: 'TypeError: x is not a function', failedStep: 'Run tests' },
    },
  ],
}
const mockGenerateTextResponse = {
  text: 'Based on the logs, the test failed due to a type error.',
  steps: [mockStepData],
}

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
}))

mock.module('../src/slack/message', () => ({
  updateSlackWithBrief: async (incidentId: string, brief: unknown) => {
    slackBriefUpdates.push({ incidentId, brief })
  },
  postThreadReply: async (incidentId: string, text: string) => {
    slackThreadReplies.push({ incidentId, text })
  },
}))

const mockBrief = {
  failureType: 'code_bug' as const,
  summary: 'TypeScript compilation failed due to type error',
  rootCause: 'TypeError in src/auth/login.ts — x is not a function',
  suggestedFix: 'Fix the function call on line 42 of src/auth/login.ts',
  confidence: 0.85,
  similarIncidentId: null,
}

mock.module('ai', () => ({
  generateText: async (opts: {
    onStepFinish?: (step: typeof mockStepData) => Promise<void>
    [key: string]: unknown
  }) => {
    generateTextCalls.push(opts)
    if (shouldThrowOnGenerate) throw new Error('LLM call failed')
    // Invoke onStepFinish callback so tool call logging is exercised
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
}))

mock.module('../src/agent/tools/github-actions', () => ({
  githubActionsTool: {
    description: 'mock tool',
    parameters: {},
    execute: async () => ({ jobName: 'Build', logs: 'error', failedStep: 'test' }),
  },
}))

const { runIncidentAgent } = await import('../src/agent/runner')

const mockIncident = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI / Build & Test',
  workflowRunId: 123,
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
