import { randomBytes, createHash } from 'crypto'
import { eq, and, gt } from 'drizzle-orm'
import { db, sessions, users } from '../db/client'

const SESSION_MAX_AGE_DAYS = 30
const SESSION_EXTEND_THRESHOLD_DAYS = 15

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `orch_${randomBytes(32).toString('hex')}`
}

interface SessionWithUser {
  session: typeof sessions.$inferSelect
  user: typeof users.$inferSelect
}

export async function createSession(userId: string): Promise<string> {
  const id = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({ id, userId, expiresAt })
  return id
}

export async function validateSession(sessionId: string): Promise<SessionWithUser | null> {
  const result = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1)

  if (result.length === 0) return null

  const row = result[0]

  // Rolling expiry: only extend if less than 15 days remaining
  const daysRemaining = (row.sessions.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  if (daysRemaining < SESSION_EXTEND_THRESHOLD_DAYS) {
    const newExpiry = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId))
  }

  return { session: row.sessions, user: row.users }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export const SESSION_COOKIE_NAME = 'orchentra_session'
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60
