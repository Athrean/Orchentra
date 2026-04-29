import { Hono } from 'hono'
import { z } from 'zod'
import { requireOrgAdmin } from '../auth/middleware'
import {
  findOrgById,
  findOrgMemberRole,
  listOrgMembers,
  findUserByUsername,
  insertOrgMember,
  updateOrgMemberRole,
  deleteOrgMember,
} from '../queries/orgs'
import { getOrgLlmConfig, upsertOrgLlmConfig, deleteOrgLlmConfig, type ResolvedLlmConfig } from '../llm-config/queries'
import type { AppVariables } from '../types'

export const orgsRouter = new Hono<{ Variables: AppVariables }>()

// GET /api/orgs/:orgId — org details + current user's role
orgsRouter.get('/', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')

  const org = await findOrgById(orgId)
  if (!org) return c.json({ error: 'Organization not found' }, 404)

  const membership = await findOrgMemberRole(orgId, user.id)

  return c.json({ org, role: membership?.role ?? null })
})

// GET /api/orgs/:orgId/members — list members with roles
orgsRouter.get('/members', async (c) => {
  const orgId = c.get('orgId')!
  const members = await listOrgMembers(orgId)
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

  const targetUser = await findUserByUsername(parsed.data.username)
  if (!targetUser) return c.json({ error: 'User not found — they must sign in to Orchentra first' }, 404)

  const existing = await findOrgMemberRole(orgId, targetUser.id)
  if (existing) return c.json({ error: 'User is already a member' }, 409)

  try {
    await insertOrgMember(orgId, targetUser.id, parsed.data.role)
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: string }).code : null
    if (code === '23505') return c.json({ error: 'User is already a member' }, 409)
    throw err
  }

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

  const target = await findOrgMemberRole(orgId, targetUserId)
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

  await updateOrgMemberRole(orgId, targetUserId, parsed.data.role)

  return c.json({ userId: targetUserId, role: parsed.data.role })
})

// DELETE /api/orgs/:orgId/members/:userId — remove member
orgsRouter.delete('/members/:userId', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!
  const targetUserId = c.req.param('userId')
  if (!targetUserId) return c.json({ error: 'Missing userId' }, 400)
  const currentUser = c.get('user')

  const target = await findOrgMemberRole(orgId, targetUserId)
  if (!target) return c.json({ error: 'Member not found' }, 404)
  if (target.role === 'owner') return c.json({ error: 'Cannot remove org owner' }, 403)
  if (targetUserId === currentUser.id) return c.json({ error: 'Cannot remove yourself' }, 403)

  await deleteOrgMember(orgId, targetUserId)

  return c.body(null, 204)
})

// ── Per-org LLM config ──────────────────────────────────────────────────────

const LlmConfigSchema = z.object({
  provider: z.enum(['openrouter', 'anthropic', 'openai', 'custom'] as const),
  modelId: z.string().min(1, 'modelId is required'),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
})

function redactConfig(cfg: ResolvedLlmConfig): {
  provider: string
  modelId: string
  baseUrl: string | null
  apiKeySet: boolean
} {
  return {
    provider: cfg.provider,
    modelId: cfg.modelId,
    baseUrl: cfg.baseUrl,
    apiKeySet: cfg.apiKey !== null && cfg.apiKey.length > 0,
  }
}

// GET /api/orgs/:orgId/llm-config — current per-org config (api key never returned)
orgsRouter.get('/llm-config', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!
  const cfg = await getOrgLlmConfig(orgId)
  if (!cfg) return c.json({ config: null })
  return c.json({ config: redactConfig(cfg) })
})

// PUT /api/orgs/:orgId/llm-config — upsert. Omitting `apiKey` retains the existing one.
orgsRouter.put('/llm-config', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = LlmConfigSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid config', issues: parsed.error.flatten() }, 400)
  }

  await upsertOrgLlmConfig(orgId, {
    provider: parsed.data.provider,
    modelId: parsed.data.modelId,
    apiKey: parsed.data.apiKey ?? null,
    baseUrl: parsed.data.baseUrl ?? null,
  })

  const fresh = await getOrgLlmConfig(orgId)
  return c.json({ config: fresh ? redactConfig(fresh) : null })
})

// DELETE /api/orgs/:orgId/llm-config — revert to global default
orgsRouter.delete('/llm-config', requireOrgAdmin, async (c) => {
  const orgId = c.get('orgId')!
  await deleteOrgLlmConfig(orgId)
  return c.body(null, 204)
})
