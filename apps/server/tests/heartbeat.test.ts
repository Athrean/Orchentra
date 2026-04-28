import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { dbClientMockBase } from './helpers/db-client-mock'

// ── Mocks ─────────────────────────────────────────────────────────────────────

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => [] }),
        }),
        where: () => ({ limit: () => [] }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
  sessions: 'sessions',
  users: 'users',
  orgMembers: 'orgMembers',
  apiKeys: 'api_keys',
  monitoredRepos: 'monitored_repos',
  incidents: 'incidents',
  organizations: 'organizations',
  toolCalls: 'tool_calls',
  resolvedPatterns: 'resolved_patterns',
  incidentActions: 'incident_actions',
}))

mock.module('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  gt: () => ({}),
  or: () => ({}),
  isNull: () => ({}),
  max: () => ({}),
}))

const { registerWsClient, unregisterWsClient, broadcastToOrg, handlePong, getWsClientCount } = await import('../src/ws')

// ── Fake WebSocket ─────────────────────────────────────────────────────────────

interface WsData {
  orgId: string
  userId: string
  repo?: string
  lastPongAt: number
}

// Track all clients registered during a test so afterEach can clean them up
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registeredInTest: any[] = []

function makeFakeWs(
  orgId: string,
  overrides?: Partial<WsData>,
): {
  data: WsData
  sent: string[]
  closed: { code?: number; reason?: string } | null
  send: (msg: string) => void
  close: (code?: number, reason?: string) => void
} {
  const sent: string[] = []
  let closed: { code?: number; reason?: string } | null = null
  const data: WsData = { orgId, userId: 'u1', lastPongAt: Date.now(), ...overrides }
  return {
    data,
    sent,
    closed,
    send(msg: string) {
      sent.push(msg)
    },
    close(code?: number, reason?: string) {
      closed = { code, reason }
      this.closed = closed
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handlePong', () => {
  test('updates lastPongAt to roughly now', () => {
    const ws = makeFakeWs('org1')
    const before = Date.now()
    ws.data.lastPongAt = 0 // simulate stale
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlePong(ws as any)
    expect(ws.data.lastPongAt).toBeGreaterThanOrEqual(before)
  })

  test('repeated pong calls keep lastPongAt fresh', async () => {
    const ws = makeFakeWs('org2')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlePong(ws as any)
    const first = ws.data.lastPongAt
    await new Promise((r) => setTimeout(r, 5))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlePong(ws as any)
    expect(ws.data.lastPongAt).toBeGreaterThanOrEqual(first)
  })
})

describe('registerWsClient / unregisterWsClient', () => {
  beforeEach(() => {
    registeredInTest.length = 0
  })

  afterEach(() => {
    for (const ws of registeredInTest) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unregisterWsClient(ws as any)
    }
    registeredInTest.length = 0
  })

  test('getWsClientCount increases on register', () => {
    const before = getWsClientCount()
    const ws = makeFakeWs('org-count')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws as any)
    registeredInTest.push(ws)
    expect(getWsClientCount()).toBe(before + 1)
  })

  test('getWsClientCount decreases on unregister', () => {
    const ws = makeFakeWs('org-dec')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws as any)
    const after = getWsClientCount()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws as any)
    expect(getWsClientCount()).toBe(after - 1)
    // Already unregistered — don't push to registeredInTest
  })

  test('unregistering unknown client is a no-op', () => {
    const ws = makeFakeWs('org-noop')
    const before = getWsClientCount()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws as any) // never registered
    expect(getWsClientCount()).toBe(before)
  })
})

describe('broadcastToOrg', () => {
  beforeEach(() => {
    registeredInTest.length = 0
  })

  afterEach(() => {
    for (const ws of registeredInTest) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unregisterWsClient(ws as any)
    }
    registeredInTest.length = 0
  })

  test('sends JSON-encoded payload to all org clients', () => {
    const ws1 = makeFakeWs('org-bcast')
    const ws2 = makeFakeWs('org-bcast')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws1 as any)
    registeredInTest.push(ws1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws2 as any)
    registeredInTest.push(ws2)

    broadcastToOrg('org-bcast', { type: 'incident:created', incidentId: 'x' })

    const expected = JSON.stringify({ type: 'incident:created', incidentId: 'x' })
    expect(ws1.sent).toContain(expected)
    expect(ws2.sent).toContain(expected)
  })

  test('skips clients subscribed to a different repo', () => {
    const wsA = makeFakeWs('org-repo-filter', {
      orgId: 'org-repo-filter',
      userId: 'u',
      lastPongAt: Date.now(),
      repo: 'owner/repoA',
    })
    const wsB = makeFakeWs('org-repo-filter', {
      orgId: 'org-repo-filter',
      userId: 'u',
      lastPongAt: Date.now(),
      repo: 'owner/repoB',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(wsA as any)
    registeredInTest.push(wsA)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(wsB as any)
    registeredInTest.push(wsB)

    broadcastToOrg('org-repo-filter', { type: 'test' }, 'owner/repoA')

    expect(wsA.sent.length).toBeGreaterThan(0)
    expect(wsB.sent.length).toBe(0)
  })

  test('does nothing for unknown orgId', () => {
    // Should not throw
    expect(() => broadcastToOrg('org-unknown-xyz', { type: 'noop' })).not.toThrow()
  })
})
