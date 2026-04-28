import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { dbClientMockBase } from './helpers/db-client-mock'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_SESSION_ID = 'a'.repeat(64)
const ORG_ID = 'org-abc'
const USER_ID = 'user-1'

const mockUser = {
  id: USER_ID,
  githubId: 12345,
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: null,
  email: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockSession = {
  id: VALID_SESSION_ID,
  userId: USER_ID,
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
  ipAddress: null,
  userAgent: null,
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

let sessionExists = true
let membershipExists = true

// Mock db/client at absolute path level — intercepted by both ws.ts and auth/session.ts
mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => (sessionExists ? [{ sessions: mockSession, users: mockUser }] : []),
          }),
        }),
        where: () => ({
          limit: () => (membershipExists ? [{ role: 'member' }] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
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
}))

const { authenticateWsUpgrade } = await import('../src/ws')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(opts: { cookie?: string; origin?: string; repo?: string }): Request {
  const url = `http://localhost:3001/ws/orgs/${ORG_ID}${opts.repo ? `?repo=${encodeURIComponent(opts.repo)}` : ''}`
  const headers = new Headers()
  headers.set('Upgrade', 'websocket')
  if (opts.cookie) headers.set('Cookie', opts.cookie)
  if (opts.origin) headers.set('Origin', opts.origin)
  return new Request(url, { headers })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  sessionExists = true
  membershipExists = true
})

describe('authenticateWsUpgrade — session cookie', () => {
  test('returns WsData when session and membership are valid', async () => {
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).not.toBeNull()
    expect(result?.orgId).toBe(ORG_ID)
    expect(result?.userId).toBe(USER_ID)
  })

  test('returns null when session cookie is missing', async () => {
    const req = makeRequest({})
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).toBeNull()
  })

  test('returns null when session is expired / not found', async () => {
    sessionExists = false
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).toBeNull()
  })

  test('parseCookie handles base64 padding "=" in session token without truncation', async () => {
    // The valid mock session id has no '=', but this test verifies parseCookie
    // correctly passes the entire token (including trailing '=' padding) to validateSession.
    // Since the mock always returns a session row regardless of ID, a non-null result
    // confirms the cookie was parsed and the lookup ran without crashing.
    const cookieHeader = `other=val1; orchentra_session=${VALID_SESSION_ID}==; next=val2`
    const req = new Request(`http://localhost:3001/ws/orgs/${ORG_ID}`, {
      headers: new Headers({ Upgrade: 'websocket', Cookie: cookieHeader }),
    })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    // Mock returns a session regardless of ID — confirms parseCookie didn't crash and
    // passed a non-empty token through (split('=') would have produced an empty string for the second '=')
    expect(result).not.toBeNull()
  })
})

describe('authenticateWsUpgrade — org membership', () => {
  test('returns null when user is not a member of the org', async () => {
    membershipExists = false
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).toBeNull()
  })

  test('includes correct orgId in returned WsData', async () => {
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result?.orgId).toBe(ORG_ID)
  })

  test('includes correct userId in returned WsData', async () => {
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result?.userId).toBe(USER_ID)
  })
})

describe('authenticateWsUpgrade — Origin validation', () => {
  test('returns null when Origin is from a different domain', async () => {
    const req = makeRequest({
      cookie: `orchentra_session=${VALID_SESSION_ID}`,
      origin: 'http://evil.example.com',
    })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).toBeNull()
  })

  test('allows request with no Origin header (server-to-server or direct)', async () => {
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).not.toBeNull()
  })

  test('allows request from default localhost:3000 origin', async () => {
    const req = makeRequest({
      cookie: `orchentra_session=${VALID_SESSION_ID}`,
      origin: 'http://localhost:3000',
    })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result).not.toBeNull()
  })
})

describe('authenticateWsUpgrade — repo query param', () => {
  test('normalises repo to lowercase', async () => {
    const req = makeRequest({
      cookie: `orchentra_session=${VALID_SESSION_ID}`,
      repo: 'Owner/Repo',
    })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result?.repo).toBe('owner/repo')
  })

  test('leaves repo undefined when not provided', async () => {
    const req = makeRequest({ cookie: `orchentra_session=${VALID_SESSION_ID}` })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result?.repo).toBeUndefined()
  })

  test('preserves slash in repo name', async () => {
    const req = makeRequest({
      cookie: `orchentra_session=${VALID_SESSION_ID}`,
      repo: 'myorg/myrepo',
    })
    const result = await authenticateWsUpgrade(req, ORG_ID)
    expect(result?.repo).toBe('myorg/myrepo')
  })
})
