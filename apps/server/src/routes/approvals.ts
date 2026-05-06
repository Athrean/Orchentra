import { Hono } from 'hono'
import { z } from 'zod'
import { validateActorCanApprove, type ApprovalActor } from '@orchentra/operations'
import { findApprovalRequest, listPendingApprovals, recordDecision, type ApprovalRecord } from '../approvals/store'
import { ApprovalConflictError, ApprovalExpiredError, ApprovalNotFoundError } from '../approvals/approvals-memory-store'
import type { AppVariables } from '../types'

/**
 * Slice 6 — approvals API.
 *
 * Mounted under `/api/orgs/:orgId/` so requireAuth + requireOrgMember run
 * before any handler here. The store layer ALSO scopes every read/write to
 * orgId — defense in depth — so a leaked approval id is not enough to
 * cross orgs even if a future router refactor accidentally drops the org
 * middleware.
 *
 * Routes:
 *   GET  /approvals?status=pending   — list pending requests for the org
 *   GET  /approvals/:id              — fetch one (404 across orgs)
 *   POST /approvals/:id/ack          — record approve/deny decision
 */
export const approvalsRouter = new Hono<{ Variables: AppVariables }>()

const AckBody = z.object({
  decision: z.enum(['approved', 'denied']),
  /** When omitted, falls back to the authenticated user's id. */
  actorId: z.string().min(1).optional(),
})

approvalsRouter.get('/approvals', async (c) => {
  const orgId = c.get('orgId')!
  const status = c.req.query('status')
  if (status && status !== 'pending') {
    return c.json({ error: 'only status=pending is supported in V1' }, 400)
  }
  const rows = await listPendingApprovals(orgId)
  return c.json({ approvals: rows.map(serializeRecord) })
})

approvalsRouter.get('/approvals/:id', async (c) => {
  const orgId = c.get('orgId')!
  const id = c.req.param('id')
  const row = await findApprovalRequest(id, orgId)
  if (!row) return c.json({ error: 'approval not found' }, 404)
  return c.json({ approval: serializeRecord(row) })
})

approvalsRouter.post('/approvals/:id/ack', async (c) => {
  const orgId = c.get('orgId')!
  const id = c.req.param('id')
  const user = c.get('user')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'request body is not valid JSON' }, 400)
  }
  const parsed = AckBody.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: `invalid body: ${parsed.error.message}` }, 400)
  }

  const existing = await findApprovalRequest(id, orgId)
  if (!existing) return c.json({ error: 'approval not found' }, 404)

  const approver: ApprovalActor = {
    id: parsed.data.actorId ?? user.id,
    type: 'user',
  }

  const block = validateActorCanApprove(approver, {
    trustClass: existing.trustClass,
    requestedBy: existing.requestedBy,
  })
  if (block) return c.json({ error: block.message, code: block.code }, 403)

  try {
    const updated = await recordDecision({
      id,
      orgId,
      decision: parsed.data.decision,
      decidedBy: approver,
    })
    return c.json({ approval: serializeRecord(updated) })
  } catch (err) {
    if (err instanceof ApprovalExpiredError) return c.json({ error: err.message, code: 'expired' }, 410)
    if (err instanceof ApprovalConflictError) return c.json({ error: err.message, code: 'already_decided' }, 409)
    if (err instanceof ApprovalNotFoundError) return c.json({ error: err.message }, 404)
    throw err
  }
})

function serializeRecord(r: ApprovalRecord): Record<string, unknown> {
  return {
    id: r.id,
    orgId: r.orgId,
    operationId: r.operationId,
    trustClass: r.trustClass,
    input: r.input,
    requestedBy: r.requestedBy,
    requestedAt: r.requestedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    status: r.status,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    metadata: r.metadata,
  }
}
