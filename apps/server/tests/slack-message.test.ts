import { describe, test, expect, mock, beforeEach } from 'bun:test'

// Shared state container — mutable properties captured by mock closures
const state = {
  postedMessages: [] as { channel: string; text: string; thread_ts?: string }[],
  updatedMessages: [] as { channel: string; ts: string; text: string }[],
  dbSetCalls: [] as Record<string, unknown>[],
  queryResult: null as Record<string, unknown> | null,
}

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
      postMessage: async (opts: { channel: string; text: string; thread_ts?: string }) => {
        state.postedMessages.push(opts)
        return { ok: true, ts: '1234567890.123456' }
      },
      update: async (opts: { channel: string; ts: string; text: string }) => {
        state.updatedMessages.push(opts)
        return { ok: true }
      },
    },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
}))

const DEFAULT_QUERY_RESULT = {
  id: 'test-incident-1',
  repo: 'my-org/api',
  workflowName: 'CI / Build & Test',
  branch: 'main',
  commit: 'abc1234def5678901234567890',
  workflowRunId: 12345,
  slackChannel: '#test-incidents',
  slackMessageTs: '1234567890.123456',
}

mock.module('../src/db/client', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.dbSetCalls.push(values)
        return { where: () => Promise.resolve() }
      },
    }),
    query: {
      incidents: {
        findFirst: async () => state.queryResult,
      },
    },
  },
  incidents: { id: 'id' },
  toolCalls: {},
  resolvedPatterns: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
}))

const { postInitialSlackMessage, updateSlackWithBrief, updateSlackToFixing, updateSlackToResolved, postThreadReply } =
  await import('../src/slack/message')

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
  state.postedMessages = []
  state.updatedMessages = []
  state.dbSetCalls = []
  state.queryResult = { ...DEFAULT_QUERY_RESULT }
})

// ─── postInitialSlackMessage ──────────────────

describe('postInitialSlackMessage', () => {
  test('posts investigating message to configured channel', async () => {
    await postInitialSlackMessage(mockIncident)

    expect(state.postedMessages.length).toBe(1)
    expect(state.postedMessages[0].channel).toBe('#test-incidents')
    expect(state.postedMessages[0].text).toContain('my-org/api')
    expect(state.postedMessages[0].text).toContain('CI / Build & Test')
    expect(state.postedMessages[0].text).toContain('main')
    expect(state.postedMessages[0].text).toContain('Investigating')
  })

  test('stores slack message timestamp in DB', async () => {
    await postInitialSlackMessage(mockIncident)

    expect(state.dbSetCalls.length).toBe(1)
    expect(state.dbSetCalls[0].slackMessageTs).toBe('1234567890.123456')
    expect(state.dbSetCalls[0].slackChannel).toBe('#test-incidents')
  })
})

// ─── updateSlackWithBrief ─────────────────────

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

    expect(state.updatedMessages.length).toBe(1)
    expect(state.updatedMessages[0].ts).toBe('1234567890.123456')
    expect(state.updatedMessages[0].channel).toBe('#test-incidents')
  })

  test('includes root cause, fix, and confidence in fallback text', async () => {
    const brief = {
      failureType: 'dependency_conflict' as const,
      summary: 'Package version mismatch',
      rootCause: 'stripe@3.0.0 requires node>=18 but CI uses node 16',
      suggestedFix: 'Pin stripe to v2.8.1 in package.json',
      confidence: 0.92,
      similarIncidentId: null,
    }

    await updateSlackWithBrief('test-incident-1', brief)

    const text = state.updatedMessages[0].text
    expect(text).toContain(brief.rootCause)
    expect(text).toContain(brief.suggestedFix)
    expect(text).toContain('92%')
  })

  test('fallback text includes repo and workflow', async () => {
    const brief = {
      failureType: 'unknown' as const,
      summary: 'Unknown failure',
      rootCause: 'Cannot determine',
      suggestedFix: 'Check logs manually',
      confidence: 0.3,
      similarIncidentId: null,
    }

    await updateSlackWithBrief('test-incident-1', brief)

    const text = state.updatedMessages[0].text
    expect(text).toContain('my-org/api')
    expect(text).toContain('CI / Build & Test')
  })

  test('no-ops when incident has no slack info', async () => {
    state.queryResult = { ...DEFAULT_QUERY_RESULT, slackMessageTs: null, slackChannel: null }
    await updateSlackWithBrief('test-incident-1', {
      failureType: 'code_bug' as const,
      summary: 's',
      rootCause: 'r',
      suggestedFix: 'f',
      confidence: 0.5,
      similarIncidentId: null,
    })
    expect(state.updatedMessages).toHaveLength(0)
  })
})

// ─── updateSlackToFixing ──────────────────────

describe('updateSlackToFixing', () => {
  const brief = {
    failureType: 'env_missing' as const,
    summary: 'DATABASE_URL not set in CI',
    rootCause: 'Missing DATABASE_URL environment variable',
    suggestedFix: 'Add DATABASE_URL to CI environment secrets',
    confidence: 0.92,
    similarIncidentId: null,
  }

  test('updates message to fixing state with action description', async () => {
    await updateSlackToFixing('test-incident-1', brief, 'Workflow re-run started', 'user-1')

    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].ts).toBe('1234567890.123456')
    expect(state.updatedMessages[0].channel).toBe('#test-incidents')
    expect(state.updatedMessages[0].text).toContain('Workflow re-run started')
  })

  test('fallback text includes repo and action', async () => {
    await updateSlackToFixing('test-incident-1', brief, 'PR #42 created', null)

    expect(state.updatedMessages[0].text).toContain('my-org/api')
    expect(state.updatedMessages[0].text).toContain('PR #42 created')
  })

  test('no-ops when incident has no slack info', async () => {
    state.queryResult = { ...DEFAULT_QUERY_RESULT, slackMessageTs: null, slackChannel: null }
    await updateSlackToFixing('test-incident-1', brief, 'test', null)
    expect(state.updatedMessages).toHaveLength(0)
  })

  test('no-ops when incident not found', async () => {
    state.queryResult = null
    await updateSlackToFixing('nonexistent', brief, 'test', null)
    expect(state.updatedMessages).toHaveLength(0)
  })
})

// ─── updateSlackToResolved ────────────────────

describe('updateSlackToResolved', () => {
  test('updates message to resolved state', async () => {
    await updateSlackToResolved('test-incident-1', 'Re-run succeeded', 120)

    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].ts).toBe('1234567890.123456')
    expect(state.updatedMessages[0].text).toContain('Resolved')
    expect(state.updatedMessages[0].text).toContain('Re-run succeeded')
  })

  test('includes MTTR in fallback text', async () => {
    await updateSlackToResolved('test-incident-1', 'Manually resolved', 3660)

    expect(state.updatedMessages[0].text).toContain('1h 1m')
  })

  test('handles null MTTR gracefully', async () => {
    await updateSlackToResolved('test-incident-1', 'Manually resolved', null)

    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].text).toContain('Resolved')
  })

  test('no-ops when incident has no slack info', async () => {
    state.queryResult = { ...DEFAULT_QUERY_RESULT, slackMessageTs: null, slackChannel: null }
    await updateSlackToResolved('test-incident-1', 'test', 60)
    expect(state.updatedMessages).toHaveLength(0)
  })

  test('no-ops when incident not found', async () => {
    state.queryResult = null
    await updateSlackToResolved('nonexistent', 'test', 60)
    expect(state.updatedMessages).toHaveLength(0)
  })
})

// ─── postThreadReply ──────────────────────────

describe('postThreadReply', () => {
  test('posts reply in thread using message timestamp', async () => {
    await postThreadReply('test-incident-1', 'Workflow re-run triggered')

    expect(state.postedMessages).toHaveLength(1)
    expect(state.postedMessages[0].channel).toBe('#test-incidents')
    expect(state.postedMessages[0].thread_ts).toBe('1234567890.123456')
    expect(state.postedMessages[0].text).toBe('Workflow re-run triggered')
  })

  test('no-ops when incident has no slack info', async () => {
    state.queryResult = { ...DEFAULT_QUERY_RESULT, slackMessageTs: null, slackChannel: null }
    await postThreadReply('test-incident-1', 'test')
    expect(state.postedMessages).toHaveLength(0)
  })

  test('no-ops when incident not found', async () => {
    state.queryResult = null
    await postThreadReply('nonexistent', 'test')
    expect(state.postedMessages).toHaveLength(0)
  })
})

// ─── Full Message Lifecycle ───────────────────

describe('message lifecycle transitions', () => {
  test('investigating → brief_ready updates message in-place', async () => {
    await postInitialSlackMessage(mockIncident)
    expect(state.postedMessages).toHaveLength(1)

    const brief = {
      failureType: 'code_bug' as const,
      summary: 'Type error',
      rootCause: 'Null reference',
      suggestedFix: 'Add null check',
      confidence: 0.8,
      similarIncidentId: null,
    }
    await updateSlackWithBrief('test-incident-1', brief)
    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].text).toContain('Null reference')
  })

  test('brief_ready → fixing updates message in-place', async () => {
    const brief = {
      failureType: 'env_missing' as const,
      summary: 'Missing env',
      rootCause: 'No API_KEY',
      suggestedFix: 'Add API_KEY',
      confidence: 0.9,
      similarIncidentId: null,
    }
    await updateSlackToFixing('test-incident-1', brief, 'Workflow re-run started', 'user-1')

    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].text).toContain('Fixing')
  })

  test('fixing → resolved updates message in-place', async () => {
    await updateSlackToResolved('test-incident-1', 'Re-run succeeded', 180)

    expect(state.updatedMessages).toHaveLength(1)
    expect(state.updatedMessages[0].text).toContain('Resolved')
    expect(state.updatedMessages[0].text).toContain('Re-run succeeded')
  })
})
