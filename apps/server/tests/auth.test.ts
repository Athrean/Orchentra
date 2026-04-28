import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { dbClientMockBase } from './helpers/db-client-mock'

let sessionRows: Record<string, unknown>[] = []
let userRows: Record<string, unknown>[] = []
let deletedSessionIds: string[] = []

const mockUser = {
  id: 'user-1',
  githubId: 12345,
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: 'https://github.com/testuser.png',
  email: 'test@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
}

mock.module('../src/db/client', () => ({
  ...dbClientMockBase(),
  db: {
    insert: (table: unknown) => ({
      values: (val: Record<string, unknown>) => {
        if (table === 'sessions') sessionRows.push(val)
        if (table === 'users') userRows.push(val)
        return { onConflictDoNothing: () => Promise.resolve() }
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => (sessionRows.length > 0 ? [{ sessions: sessionRows[0], users: mockUser }] : []),
          }),
        }),
        where: () => ({
          limit: () => (userRows.length > 0 ? [userRows[0]] : []),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        if (table === 'sessions') deletedSessionIds.push('deleted')
        return Promise.resolve()
      },
    }),
  },
  sessions: 'sessions',
  users: 'users',
  apiKeys: 'api_keys',
  monitoredRepos: 'monitored_repos',
}))

mock.module('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  gt: () => ({}),
  or: () => ({}),
  isNull: () => ({}),
}))

const { generateSessionToken, generateApiKey, hashApiKey, SESSION_COOKIE_NAME } = await import('../src/auth/session')

beforeEach(() => {
  sessionRows = []
  userRows = []
  deletedSessionIds = []
})

describe('session token generation', () => {
  test('generates 64-char hex token (32 bytes)', () => {
    const token = generateSessionToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  test('generates unique tokens', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()
    expect(a).not.toBe(b)
  })
})

describe('API key generation', () => {
  test('generates key with orch_ prefix', () => {
    const key = generateApiKey()
    expect(key.startsWith('orch_')).toBe(true)
    expect(key).toHaveLength(69) // "orch_" (5) + 64 hex chars
  })

  test('hashApiKey produces consistent SHA-256 hash', () => {
    const key = 'orch_abc123'
    const hash1 = hashApiKey(key)
    const hash2 = hashApiKey(key)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 = 64 hex chars
  })

  test('different keys produce different hashes', () => {
    const h1 = hashApiKey(generateApiKey())
    const h2 = hashApiKey(generateApiKey())
    expect(h1).not.toBe(h2)
  })
})

describe('session cookie name', () => {
  test('uses orchentra_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('orchentra_session')
  })
})
