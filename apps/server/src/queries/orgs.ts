import { eq, and } from 'drizzle-orm'
import { db, organizations, orgMembers, users } from '../db/client'

interface OrgMemberRow {
  userId: string
  role: string
  joinedAt: Date
  username: string
  displayName: string | null
  avatarUrl: string | null
}

export async function findOrgById(orgId: string): Promise<typeof organizations.$inferSelect | null> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
  return row ?? null
}

export async function findOrgMemberRole(orgId: string, userId: string): Promise<{ role: string } | null> {
  const [row] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  return db
    .select({
      userId: orgMembers.userId,
      role: orgMembers.role,
      joinedAt: orgMembers.createdAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
}

export async function findUserByUsername(username: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  return row ?? null
}

export async function insertOrgMember(orgId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  await db.insert(orgMembers).values({ orgId, userId, role })
}

export async function updateOrgMemberRole(orgId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  await db
    .update(orgMembers)
    .set({ role })
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
}

export async function deleteOrgMember(orgId: string, userId: string): Promise<void> {
  await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
}
