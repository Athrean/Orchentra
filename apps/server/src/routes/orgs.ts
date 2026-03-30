import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { db, orgMembers, organizations, users } from '../db/client'
import { requireOrgAdmin } from '../auth/middleware'
import type { AppVariables } from '../types'

export const orgsRouter = new Hono<{ Variables: AppVariables }>()

// GET /api/orgs/:orgId — org details + current user's role
orgsRouter.get('/', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
  if (!org) return c.json({ error: 'Organization not found' }, 404)

  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1)

  return c.json({ org, role: membership?.role ?? null })
})

// GET /api/orgs/:orgId/members — list members with roles
orgsRouter.get('/members', async (c) => {
  const orgId = c.get('orgId')!

  const members = await db
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

  return c.json({ members })
})

const AddMemberSchema = z.object({
  username: z.string().min(1),
  role: z.enum(['admin', 'member']).default('member'),
})

// POST /api/orgs/:orgId/members — add member by GitHub username
orgsRouter.post('/members', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = AddMemberSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, parsed.data.username))
    .limit(1)

  if (!targetUser) return c.json({ error: 'User not found — they must sign in to Orchentra first' }, 404)

  const [existing] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUser.id)))
    .limit(1)

  if (existing) return c.json({ error: 'User is already a member' }, 409)

  await db.insert(orgMembers).values({ orgId, userId: targetUser.id, role: parsed.data.role })

  return c.json({ userId: targetUser.id, role: parsed.data.role }, 201)
})

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

// PATCH /api/orgs/:orgId/members/:userId — update role
orgsRouter.patch('/members/:userId', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!
  const targetUserId = c.req.param('userId')
  if (!targetUserId) return c.json({ error: 'Missing userId' }, 400)

  const [target] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))
    .limit(1)

  if (!target) return c.json({ error: 'Member not found' }, 404)
  if (target.role === 'owner') return c.json({ error: 'Cannot change role of org owner' }, 403)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  await db
    .update(orgMembers)
    .set({ role: parsed.data.role })
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))

  return c.json({ userId: targetUserId, role: parsed.data.role })
})

// DELETE /api/orgs/:orgId/members/:userId — remove member
orgsRouter.delete('/members/:userId', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!
  const targetUserId = c.req.param('userId')
  if (!targetUserId) return c.json({ error: 'Missing userId' }, 400)
  const currentUser = c.get('user')

  const [target] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))
    .limit(1)

  if (!target) return c.json({ error: 'Member not found' }, 404)
  if (target.role === 'owner') return c.json({ error: 'Cannot remove org owner' }, 403)
  if (targetUserId === currentUser.id) return c.json({ error: 'Cannot remove yourself' }, 403)

  await db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, targetUserId)))

  return c.body(null, 204)
})
