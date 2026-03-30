import { eq } from 'drizzle-orm'
import { db, orgMembers, organizations, users } from '../db/client'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505'
}

function toSlug(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function ensureUserOrg(userId: string): Promise<void> {
  const existing = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  if (existing.length > 0) return

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return

  const baseSlug = toSlug(user.username)
  const orgId = crypto.randomUUID()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({ id: orgId, name: user.username, slug: baseSlug })
      await tx.insert(orgMembers).values({ orgId, userId, role: 'owner' })
    })
  } catch (err) {
    // Only retry on unique-constraint violation (PostgreSQL error code 23505)
    if (!isUniqueViolation(err)) throw err
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({ id: orgId, name: user.username, slug })
      await tx.insert(orgMembers).values({ orgId, userId, role: 'owner' })
    })
  }
}
