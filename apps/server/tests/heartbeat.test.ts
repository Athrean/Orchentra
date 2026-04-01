import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

// ── Mocks ─────────────────────────────────────────────────────────────────────

mock.module('../src/db/client', () => ({
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

interface WsData { orgId: string; userId: string; repo?: string; lastPongAt: number }

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
    // Reset client count for isolation
  })

  afterEach(() => {
    // clean up after each test
  })

  test('getWsClientCount increases on register', () => {
    const before = getWsClientCount()
    const ws = makeFakeWs('org-count')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws as any)
    expect(getWsClientCount()).toBe(before + 1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws as any)
  })

  test('getWsClientCount decreases on unregister', () => {
    const ws = makeFakeWs('org-dec')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws as any)
    const after = getWsClientCount()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws as any)
    expect(getWsClientCount()).toBe(after - 1)
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
  test('sends JSON-encoded payload to all org clients', () => {
    const ws1 = makeFakeWs('org-bcast')
    const ws2 = makeFakeWs('org-bcast')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws1 as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(ws2 as any)

    broadcastToOrg('org-bcast', { type: 'incident:created', incidentId: 'x' })

    const expected = JSON.stringify({ type: 'incident:created', incidentId: 'x' })
    expect(ws1.sent).toContain(expected)
    expect(ws2.sent).toContain(expected)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws1 as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(ws2 as any)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWsClient(wsB as any)

    broadcastToOrg('org-repo-filter', { type: 'test' }, 'owner/repoA')

    expect(wsA.sent.length).toBeGreaterThan(0)
    expect(wsB.sent.length).toBe(0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(wsA as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unregisterWsClient(wsB as any)
  })

  test('does nothing for unknown orgId', () => {
    // Should not throw
    expect(() => broadcastToOrg('org-unknown-xyz', { type: 'noop' })).not.toThrow()
  })
})
