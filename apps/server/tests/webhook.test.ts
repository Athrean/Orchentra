import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { createHmac } from 'crypto'

const TEST_SECRET = 'test-webhook-secret-123'

// Tracking arrays
let insertedIncidents: Record<string, unknown>[] = []
let insertedWebhookEvents: Record<string, unknown>[] = []
let queueCalls: string[] = []
let githubInitialWrites: string[] = []
let simulateDuplicate = false
let simulateWebhookEventDuplicate = false

// Must mock ALL dependencies BEFORE importing the router
mock.module('../src/config', () => ({
  config: {
    github: {
      webhook_secret: TEST_SECRET,
      token: 'ghp_test',
      repos: ['my-org/api'],
    },
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
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))

mock.module('../src/db/client', () => ({
  db: {
    insert: () => ({
      values: (val: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            // Distinguish webhook_events (have `provider`) from incidents (have `repo`)
            const isWebhookEvent = 'provider' in val
            if (isWebhookEvent) {
              if (simulateWebhookEventDuplicate) return []
              insertedWebhookEvents.push(val)
              return [{ ...val }]
            }
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
      monitoredRepos: {
        findMany: async () => [{ orgId: 'org-1', repo: 'my-org/api' }],
      },
    },
  },
  incidents: { workflowRunId: 'workflow_run_id', id: 'id' },
  toolCalls: {},
  resolvedPatterns: {},
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

mock.module('../src/lib/incident-queue', () => ({
  enqueueInvestigateJob: async (incident: { id: string }) => {
    queueCalls.push(incident.id)
  },
}))

mock.module('../src/github/triage-writeback', () => ({
  publishInitialGithubTriage: async (incident: { id: string }) => {
    githubInitialWrites.push(incident.id)
  },
}))

mock.module('../src/agent/patterns', () => ({
  saveResolvedPattern: async (_incidentId: string) => {},
}))

mock.module('../src/lib/webhook-dedup', () => {
  const debouncedEntries: Map<string, number> = new Map()
  const DEBOUNCE_TTL_MS = 30_000
  return {
    isDuplicateInFlight: () => false,
    registerInFlight: () => {},
    isDebounced: (repo: string, branch: string, commit: string) => {
      const key = `${repo}:${branch}:${commit}`
      const seenAt = debouncedEntries.get(key)
      if (seenAt && Date.now() - seenAt < DEBOUNCE_TTL_MS) return true
      return false
    },
    registerDebounce: (repo: string, branch: string, commit: string) => {
      debouncedEntries.set(`${repo}:${branch}:${commit}`, Date.now())
    },
    _resetState: () => {
      debouncedEntries.clear()
    },
  }
})

// Import AFTER all mocks are set up
const { webhooksRouter } = await import('../src/routes/webhooks')
const { _resetState: resetDedupState } = await import('../src/lib/webhook-dedup')
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
  insertedWebhookEvents = []
  queueCalls = []
  githubInitialWrites = []
  simulateDuplicate = false
  simulateWebhookEventDuplicate = false
  resetDedupState()
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

    // Insert was attempted but onConflictDoNothing returned empty — no queue/writeback calls
    expect(queueCalls.length).toBe(0)
    expect(githubInitialWrites.length).toBe(0)
  })

  test('synthesizes a delivery ID when x-github-delivery header is missing', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload({ workflow_run: { id: 7777, head_sha: 'empty-delivery-test' } }))

    // Send without an x-github-delivery header
    const res = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'workflow_run',
        'x-hub-signature-256': sign(body),
      },
      body,
    })
    await Bun.sleep(100)

    expect(res.status).toBe(200)
    // Webhook event was persisted with a non-empty synthetic event id
    expect(insertedWebhookEvents.length).toBe(1)
    const eventId = insertedWebhookEvents[0].eventId as string
    expect(eventId.length).toBeGreaterThan(0)
    expect(eventId.startsWith('synthetic-')).toBe(true)
    // Incident was still created
    expect(insertedIncidents.length).toBe(1)
  })

  test('cold-path dedup fires when synthetic delivery ID already exists', async () => {
    simulateWebhookEventDuplicate = true
    const app = makeApp()
    const body = JSON.stringify(makePayload({ workflow_run: { id: 8888, head_sha: 'dup-test' } }))

    // Send without an x-github-delivery header — webhook-event insert should dedupe
    const res = await app.request('/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'workflow_run',
        'x-hub-signature-256': sign(body),
      },
      body,
    })
    await Bun.sleep(100)

    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; deduplicated?: boolean }
    expect(json.deduplicated).toBe(true)
    // Dedup short-circuits before incident insert + queue
    expect(insertedIncidents.length).toBe(0)
    expect(queueCalls.length).toBe(0)
    expect(githubInitialWrites.length).toBe(0)
  })
})

describe('GitHub Webhook — Pipeline', () => {
  test('publishes initial GitHub triage and enqueues investigation', async () => {
    const app = makeApp()
    const body = JSON.stringify(makePayload())

    await sendWebhook(app, body)
    await Bun.sleep(100)

    expect(githubInitialWrites.length).toBe(1)
    expect(queueCalls.length).toBe(1)
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

function makeCheckRunPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'completed',
    check_run: {
      id: Date.now(),
      name: 'lint',
      head_sha: 'abc1234def5678',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-04-01T10:00:00Z',
      completed_at: '2026-04-01T10:01:00Z',
      check_suite: { id: 9001, head_branch: 'main' },
      ...(overrides.check_run ?? {}),
    },
    repository: {
      full_name: 'my-org/api',
      name: 'api',
      ...(overrides.repository ?? {}),
    },
  }
}

function makeCheckSuitePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: 'completed',
    check_suite: {
      id: 4242,
      head_branch: 'main',
      head_sha: 'suite-sha-aaaa',
      conclusion: 'failure',
      created_at: '2026-04-01T10:00:00Z',
      ...(overrides.check_suite ?? {}),
    },
    repository: {
      full_name: 'my-org/api',
      name: 'api',
      ...(overrides.repository ?? {}),
    },
  }
}

describe('GitHub Webhook — check_run normalization', () => {
  test('processes check_run completed failures into an incident', async () => {
    const app = makeApp()
    const body = JSON.stringify(makeCheckRunPayload())

    await sendWebhook(app, body, { event: 'check_run' })
    await Bun.sleep(100)

    expect(insertedIncidents.length).toBe(1)
    const incident = insertedIncidents[0]
    expect(incident.repo).toBe('my-org/api')
    expect(incident.branch).toBe('main')
    expect(incident.commit).toBe('abc1234def5678')
    expect(incident.workflowName).toBe('lint')
    expect(incident.status).toBe('investigating')
  })

  test('skips check_run with non-failure conclusion', async () => {
    const app = makeApp()
    const body = JSON.stringify(
      makeCheckRunPayload({
        check_run: {
          id: 11,
          name: 'lint',
          head_sha: 'sha-success',
          conclusion: 'success',
          check_suite: { id: 1, head_branch: 'main' },
        },
      }),
    )

    await sendWebhook(app, body, { event: 'check_run' })
    await Bun.sleep(50)

    expect(insertedIncidents.length).toBe(0)
  })
})

describe('GitHub Webhook — check_suite normalization', () => {
  test('processes a check_suite failure into an incident', async () => {
    const app = makeApp()
    const body = JSON.stringify(makeCheckSuitePayload())

    await sendWebhook(app, body, { event: 'check_suite' })
    await Bun.sleep(100)

    expect(insertedIncidents.length).toBe(1)
    const incident = insertedIncidents[0]
    expect(incident.repo).toBe('my-org/api')
    expect(incident.commit).toBe('suite-sha-aaaa')
  })

  test('debounces multiple check_run failures for the same (repo, branch, commit)', async () => {
    const app = makeApp()
    const sharedSha = 'storm-sha-bbbb'
    const make = (id: number, name: string): string =>
      JSON.stringify(
        makeCheckRunPayload({
          check_run: {
            id,
            name,
            head_sha: sharedSha,
            conclusion: 'failure',
            check_suite: { id: 99, head_branch: 'main' },
          },
        }),
      )

    await sendWebhook(app, make(1, 'lint'), { event: 'check_run' })
    await sendWebhook(app, make(2, 'typecheck'), { event: 'check_run' })
    await sendWebhook(app, make(3, 'unit-tests'), { event: 'check_run' })
    await Bun.sleep(100)

    expect(insertedIncidents.length).toBe(1)
  })
})
