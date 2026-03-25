import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createHmac } from 'crypto'

const TEST_SECRET = 'test-webhook-secret-123'

// Tracking arrays
let insertedIncidents: Record<string, unknown>[] = []
let slackCalls: string[] = []
let agentCalls: string[] = []
let simulateDuplicate = false

// Must mock ALL dependencies BEFORE importing the router
mock.module('../src/config', () => ({
  config: {
    github: {
      webhook_secret: TEST_SECRET,
      token: 'ghp_test',
      repos: ['my-org/api'],
    },
    delivery: {
      slack: {
        bot_token: 'xoxb-test',
        signing_secret: 'slack-secret',
        channel: '#test',
      },
    },
  },
}))

mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({}),
}))

mock.module('../src/db/client', () => ({
  db: {
    insert: () => ({
      values: (val: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            if (simulateDuplicate) return []
            insertedIncidents.push(val)
            return [{ ...val }]
          },
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
    query: {
      incidents: {
        findFirst: async () => null,
      },
    },
  },
  incidents: { workflowRunId: 'workflow_run_id', id: 'id' },
  toolCalls: {},
  resolvedPatterns: {},
  users: {},
  sessions: {},
  apiKeys: {},
  monitoredRepos: {},
}))

mock.module('../src/lib/repo-cache', () => ({
  isRepoMonitored: async () => true,
  getMonitoredRepos: async () => new Set(['my-org/api']),
  invalidateMonitoredReposCache: () => {},
}))

// Provide complete mock of slack/message with ALL exported functions.
// Bun's mock.module is global — an incomplete mock here would break slack-message.test.ts
// which imports `updateSlackWithBrief` from the same module.
const slackPostedMessages: { channel: string; text: string }[] = []
const slackUpdatedMessages: { channel: string; ts: string; text: string }[] = []

mock.module('../src/slack/client', () => ({
  slack: {
    chat: {
      postMessage: async (opts: { channel: string; text: string }) => {
        slackPostedMessages.push(opts)
        return { ok: true, ts: '1234567890.123456' }
      },
      update: async (opts: { channel: string; ts: string; text: string }) => {
        slackUpdatedMessages.push(opts)
        return { ok: true }
      },
    },
  },
}))

mock.module('../src/slack/message', () => ({
  postInitialSlackMessage: async (incident: { id: string }) => {
    slackCalls.push(incident.id)
  },
  updateSlackWithBrief: async (_id: string, _brief: unknown) => {},
  postThreadReply: async (_id: string, _text: string) => {},
}))

mock.module('../src/agent/runner', () => ({
  runIncidentAgent: async (incident: { id: string }) => {
    agentCalls.push(incident.id)
  },
}))

// Import AFTER all mocks are set up
const { webhooksRouter } = await import('../src/routes/webhooks')
import { Hono } from 'hono'

function makeApp(): Hono {
  const app = new Hono()
  app.route('/webhooks', webhooksRouter)
  return app
}

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', TEST_SECRET).update(body).digest('hex')
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'completed',
    workflow_run: {
      id: Date.now(),
      name: 'CI / Build & Test',
      head_branch: 'main',
      head_sha: 'abc1234def5678',
      conclusion: 'failure',
      created_at: new Date().toISOString(),
      ...(overrides.workflow_run ?? {}),
    },
    repository: {
      full_name: 'my-org/api',
      name: 'api',
      ...(overrides.repository ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'workflow_run' && k !== 'repository')),
  }
}

async function sendWebhook(
  app: ReturnType<typeof makeApp>,
  body: string,
  opts: { event?: string; signature?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-github-event': opts.event ?? 'workflow_run',
  }
  if (opts.signature !== undefined) {
    headers['x-hub-signature-256'] = opts.signature
  } else {
    headers['x-hub-signature-256'] = sign(body)
  }
  return app.request('/webhooks/github', {
    method: 'POST',
    headers,
    body,
  })
}

beforeEach(() => {
  insertedIncidents = []
  slackCalls = []
  agentCalls = []
  simulateDuplicate = false
})

describe('GitHub Webhook — Signature Verification', () => {
  test('rejects invalid signature', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    const res = await sendWebhook(app, body, { signature: 'sha256=invalid' })
    expect(res.status).toBe(401)

    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Invalid signature')
  })

  test('rejects missing signature', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    const res = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'workflow_run',
      },
      body,
    })
    expect(res.status).toBe(401)
  })

  test('accepts valid signature', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    const res = await sendWebhook(app, body)
    expect(res.status).toBe(200)

    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
  })
})

describe('GitHub Webhook — Event Filtering', () => {
  test('ignores successful workflow runs', async () => {
    const app = makeApp()
    const payload = makePayload({
      workflow_run: {
        id: 99999,
        name: 'CI',
        head_branch: 'main',
        head_sha: 'abc',
        conclusion: 'success',
        created_at: new Date().toISOString(),
      },
    })
    const body = JSON.stringify(payload)

    await sendWebhook(app, body)
    await Bun.sleep(50)

    expect(insertedIncidents.length).toBe(0)
  })

  test('ignores non-workflow_run events', async () => {
    const app = makeApp()
    const body = JSON.stringify({ action: 'opened', pull_request: {} })

    await sendWebhook(app, body, { event: 'pull_request' })
    await Bun.sleep(50)

    expect(insertedIncidents.length).toBe(0)
  })

  test('returns 400 on malformed JSON', async () => {
    const app = makeApp()
    const body = 'not valid json {'

    const res = await sendWebhook(app, body)
    expect(res.status).toBe(400)
  })

  test('processes workflow_run failures', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    await sendWebhook(app, body)
    await Bun.sleep(100)

    expect(insertedIncidents.length).toBe(1)
    expect(insertedIncidents[0].repo).toBe('my-org/api')
    expect(insertedIncidents[0].workflowName).toBe('CI / Build & Test')
    expect(insertedIncidents[0].status).toBe('investigating')
  })
})

describe('GitHub Webhook — Deduplication', () => {
  test('skips processing for duplicate workflow run IDs', async () => {
    simulateDuplicate = true
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    await sendWebhook(app, body)
    await Bun.sleep(100)

    // Insert was attempted but onConflictDoNothing returned empty — no Slack/agent calls
    expect(slackCalls.length).toBe(0)
    expect(agentCalls.length).toBe(0)
  })
})

describe('GitHub Webhook — Pipeline', () => {
  test('posts to Slack and runs agent after creating incident', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    await sendWebhook(app, body)
    await Bun.sleep(100)

    expect(slackCalls.length).toBe(1)
    expect(agentCalls.length).toBe(1)
  })

  test('extracts correct fields from payload', async () => {
    const app = makeApp()
    const payload = makePayload({
      workflow_run: {
        id: 42,
        name: 'Deploy Production',
        head_branch: 'release/v2.1',
        head_sha: 'deadbeef123456',
        conclusion: 'failure',
        created_at: '2026-03-17T10:00:00Z',
      },
      repository: { full_name: 'my-org/frontend', name: 'frontend' },
    })
    const body = JSON.stringify(payload)

    await sendWebhook(app, body)
    await Bun.sleep(100)

    const incident = insertedIncidents[0]
    expect(incident.repo).toBe('my-org/frontend')
    expect(incident.branch).toBe('release/v2.1')
    expect(incident.commit).toBe('deadbeef123456')
    expect(incident.workflowName).toBe('Deploy Production')
    expect(incident.workflowRunId).toBe(42)
  })
})
