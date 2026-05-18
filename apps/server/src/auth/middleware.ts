import type { Context, Next } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import { eq, and, gt, isNull, or } from 'drizzle-orm'
import { db, apiKeys, orgMembers, users } from '../db/client'
import { validateSession, SESSION_COOKIE_NAME, hashApiKey } from './session'
import { getInstallationByApiKeyHash } from '../github/installations'
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
    if (user) {
      c.set('user', user)
      return next()
    }
    // User-issued lookup missed — fall through to the installation-scoped
    // key path. Bootstrap apiKeys minted at GitHub App install time aren't
    // tied to a user row; they live on `github_installations.api_key_hash`
    // and grant access only to their own org.
    const key = authHeader.slice('Bearer '.length)
    const installation = await resolveInstallationFromApiKey(key)
    if (installation) {
      c.set('installation', installation)
      c.set('user', sentinelInstallationUser(installation.installationId))
      return next()
    }
    return c.json({ error: 'Invalid API key' }, 401)
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

/**
 * Require the authenticated user to be a member of the org in `:orgId`.
 * Must run after requireAuth. Sets `orgId` in context on success.
 */
export async function requireOrgMember(c: Context, next: Next): Promise<Response | void> {
  const result = await resolveOrgMembership(c)
  if (result instanceof Response) return result

  c.set('orgId', result.orgId)
  return next()
}

/**
 * Require the authenticated user to be an owner or admin of the org in `:orgId`.
 * Must run after requireAuth. Sets `orgId` in context on success.
 */
export async function requireOrgAdmin(c: Context, next: Next): Promise<Response | void> {
  const result = await resolveOrgMembership(c)
  if (result instanceof Response) return result

  if (result.role !== 'owner' && result.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)

  c.set('orgId', result.orgId)
  return next()
}

async function resolveOrgMembership(c: Context): Promise<{ orgId: string; role: string } | Response> {
  const orgId = c.req.param('orgId')
  if (!orgId) return c.json({ error: 'Missing orgId' }, 400)

  // Installation-scoped principals don't have an `org_members` row — they
  // are authorized for their own installation's org and nothing else. The
  // bootstrap apiKey minted at GitHub App install grants exactly this.
  const installation = c.get('installation')
  if (installation) {
    if (installation.orgId !== orgId) return c.json({ error: 'Forbidden' }, 403)
    return { orgId, role: 'installation' }
  }

  const user = c.get('user')
  if (!user) return c.json({ error: 'Authentication required' }, 401)

  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1)

  if (!membership) return c.json({ error: 'Forbidden' }, 403)

  return { orgId, role: membership.role }
}

async function resolveInstallationFromApiKey(key: string): Promise<{ installationId: number; orgId: string } | null> {
  if (!key.startsWith('orch_')) return null
  const record = await getInstallationByApiKeyHash(hashApiKey(key))
  if (!record || record.suspendedAt) return null
  return { installationId: record.installationId, orgId: record.orgId }
}

function sentinelInstallationUser(installationId: number): UserRow {
  const now = new Date()
  return {
    id: `installation:${installationId}`,
    githubId: 0,
    username: `installation:${installationId}`,
    displayName: null,
    avatarUrl: null,
    email: null,
    githubAccessToken: null,
    createdAt: now,
    updatedAt: now,
  }
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

  // Fire-and-forget: telemetry update shouldn't fail the request
  void db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, result[0].api_keys.id))
    .catch(() => {})

  return result[0].users
}
