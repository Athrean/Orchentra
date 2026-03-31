import { eq, asc } from 'drizzle-orm'
import { db, orgMembers, organizations } from '../db/client'

interface UserOrgMembership {
  orgId: string
  role: string
  orgName: string
  orgSlug: string
}

export async function getUserFirstOrgMembership(userId: string): Promise<UserOrgMembership | null> {
  const [row] = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1)
  return row ?? null
}
