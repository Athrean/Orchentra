import type { Context, Next } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import { eq, and, gt, isNull, or } from 'drizzle-orm'
import { db, apiKeys, users } from '../db/client'
import { validateSession, SESSION_COOKIE_NAME, hashApiKey } from './session'
import type { UserRow } from '../types'

/** Require a valid session cookie. Returns 401 if missing/expired. */
export async function requireSession(c: Context, next: Next): Promise<Response | void> {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME)
  if (!sessionId) return c.json({ error: 'Authentication required' }, 401)

  const result = await validateSession(sessionId)
  if (!result) {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
    return c.json({ error: 'Session expired' }, 401)
  }

  c.set('user', result.user)
  return next()
}

/** Require a valid API key via Authorization header. Returns 401 if missing/invalid. */
export async function requireApiKey(c: Context, next: Next): Promise<Response | void> {
  const user = await resolveApiKeyUser(c)
  if (!user) return c.json({ error: 'Invalid API key' }, 401)
  c.set('user', user)
  return next()
}

/**
 * Accept either API key or session cookie.
 * Precedence: API key header checked first. If present, it wins (supports CI contexts
 * where a cookie might be leftover from a browser session). Falls back to session cookie.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer orch_')) {
    const user = await resolveApiKeyUser(c)
    if (!user) return c.json({ error: 'Invalid API key' }, 401)
    c.set('user', user)
    return next()
  }

  const sessionId = getCookie(c, SESSION_COOKIE_NAME)
  if (sessionId) {
    const result = await validateSession(sessionId)
    if (result) {
      c.set('user', result.user)
      return next()
    }
    // Clear stale cookie to avoid repeated DB lookups
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
  }

  return c.json({ error: 'Authentication required' }, 401)
}

async function resolveApiKeyUser(c: Context): Promise<UserRow | null> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const key = authHeader.slice(7)
  if (!key.startsWith('orch_')) return null

  const keyHash = hashApiKey(key)
  const now = new Date()

  const result = await db
    .select()
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, keyHash), or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))))
    .limit(1)

  if (result.length === 0) return null

  // Update lastUsedAt
  await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, result[0].api_keys.id))

  return result[0].users
}
