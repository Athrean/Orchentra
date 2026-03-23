import { describe, test, expect, mock, beforeEach } from 'bun:test'

// Tracking
let postedMessages: { channel: string; text: string }[] = []
let updatedMessages: { channel: string; ts: string; text: string }[] = []
let dbSetCalls: Record<string, unknown>[] = []

mock.module('../src/config', () => ({
  config: {
    delivery: {
      slack: {
        bot_token: 'xoxb-test',
        signing_secret: 'slack-secret',
        channel: '#test-incidents',
      },
    },
  },
}))

mock.module('../src/slack/client', () => ({
  slack: {
    chat: {
      postMessage: async (opts: { channel: string; text: string }) => {
        postedMessages.push(opts)
        return { ok: true, ts: '1234567890.123456' }
      },
      update: async (opts: { channel: string; ts: string; text: string }) => {
        updatedMessages.push(opts)
        return { ok: true }
      },
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
        dbSetCalls.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
    query: {
      incidents: {
        findFirst: async () => ({
          id: 'test-incident-1',
          repo: 'my-org/api',
          workflowName: 'CI / Build & Test',
          branch: 'main',
          commit: 'abc1234def5678901234567890',
          slackChannel: '#test-incidents',
          slackMessageTs: '1234567890.123456',
        }),
      },
    },
  },
  incidents: { id: 'id' },
}))

const { postInitialSlackMessage, updateSlackWithBrief } = await import('../src/slack/message')

const mockIncident = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678901234567890',
  workflowName: 'CI / Build & Test',
  workflowRunId: 12345,
  failedStep: null,
  status: 'investigating' as const,
  briefJson: null,
  confidence: null,
  rootCause: null,
  suggestedFix: null,
  slackChannel: null,
  slackMessageTs: null,
  triggeredAt: new Date(),
  resolvedAt: null,
  mttrSeconds: null,
  createdAt: new Date(),
}

beforeEach(() => {
  postedMessages = []
  updatedMessages = []
  dbSetCalls = []
})

describe('postInitialSlackMessage', () => {
  test('posts investigating message to configured channel', async () => {
    await postInitialSlackMessage(mockIncident)

    expect(postedMessages.length).toBe(1)
    expect(postedMessages[0].channel).toBe('#test-incidents')
    expect(postedMessages[0].text).toContain('my-org/api')
    expect(postedMessages[0].text).toContain('CI / Build & Test')
    expect(postedMessages[0].text).toContain('main')
    expect(postedMessages[0].text).toContain('Investigating')
  })

  test('stores slack message timestamp in DB', async () => {
    await postInitialSlackMessage(mockIncident)

    expect(dbSetCalls.length).toBe(1)
    expect(dbSetCalls[0].slackMessageTs).toBe('1234567890.123456')
    expect(dbSetCalls[0].slackChannel).toBe('#test-incidents')
  })
})

describe('updateSlackWithBrief', () => {
  test('updates existing message with classification results', async () => {
    const brief = {
      failureType: 'code_bug' as const,
      summary: 'Type error in auth module',
      rootCause: 'String passed where number expected in login.ts:42',
      suggestedFix: 'Use parseInt(rawId) instead of rawId',
      confidence: 0.85,
      similarIncidentId: null,
    }

    await updateSlackWithBrief('test-incident-1', brief)

    expect(updatedMessages.length).toBe(1)
    expect(updatedMessages[0].ts).toBe('1234567890.123456')
    expect(updatedMessages[0].channel).toBe('#test-incidents')
  })

  test('includes root cause, fix, and confidence in updated message', async () => {
    const brief = {
      failureType: 'dependency_conflict' as const,
      summary: 'Package version mismatch',
      rootCause: 'stripe@3.0.0 requires node>=18 but CI uses node 16',
      suggestedFix: 'Pin stripe to v2.8.1 in package.json',
      confidence: 0.92,
      similarIncidentId: null,
    }

    await updateSlackWithBrief('test-incident-1', brief)

    const text = updatedMessages[0].text
    expect(text).toContain(brief.rootCause)
    expect(text).toContain(brief.suggestedFix)
    expect(text).toContain('92%')
    expect(text).toContain('dependency conflict')
  })

  test('shows short commit hash, not full hash', async () => {
    const brief = {
      failureType: 'unknown' as const,
      summary: 'Unknown failure',
      rootCause: 'Cannot determine',
      suggestedFix: 'Check logs manually',
      confidence: 0.3,
      similarIncidentId: null,
    }

    await updateSlackWithBrief('test-incident-1', brief)

    const text = updatedMessages[0].text
    expect(text).toContain('abc1234')
    expect(text).not.toContain('abc1234def5678901234567890')
  })
})
