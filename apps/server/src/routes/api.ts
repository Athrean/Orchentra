import { Hono } from 'hono'
import { eq, asc } from 'drizzle-orm'
import { db, orgMembers, organizations } from '../db/client'
import type { AppVariables } from '../types'

export const apiRouter = new Hono<{ Variables: AppVariables }>()

apiRouter.get('/me', async (c) => {
  const user = c.get('user') as Record<string, unknown> | undefined
  if (!user) return c.json({ user: null, org: null })

  const [membership] = await db
    .select({
      orgId: orgMembers.orgId,
      role: orgMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.id as string))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1)

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
    org: membership
      ? { id: membership.orgId, name: membership.orgName, slug: membership.orgSlug, role: membership.role }
      : null,
  })
})
