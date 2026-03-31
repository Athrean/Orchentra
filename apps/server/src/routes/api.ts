import { Hono } from 'hono'
import { getUserFirstOrgMembership } from '../queries/users'
import type { AppVariables } from '../types'

export const apiRouter = new Hono<{ Variables: AppVariables }>()

apiRouter.get('/me', async (c) => {
  const user = c.get('user') as Record<string, unknown> | undefined
  if (!user) return c.json({ user: null, org: null })

  const membership = await getUserFirstOrgMembership(user.id as string)

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
