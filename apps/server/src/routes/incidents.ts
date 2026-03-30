import { Hono } from 'hono'
import { eq, desc, count, and } from 'drizzle-orm'
import { UpdateIncidentStatusSchema } from '@orchentra/core'
import { db, incidents, toolCalls, incidentActions } from '../db/client'
import { updateIncidentStatus } from '../actions/handlers'
import type { AppVariables } from '../types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const incidentsRouter = new Hono<{ Variables: AppVariables }>()

incidentsRouter.get('/incidents', async (c) => {
  const orgId = c.get('orgId')!
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 100)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '', 10) || 0, 0)
  const repo = c.req.query('repo')

  const whereClause = repo ? and(eq(incidents.orgId, orgId), eq(incidents.repo, repo)) : eq(incidents.orgId, orgId)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: incidents.id,
        repo: incidents.repo,
        branch: incidents.branch,
        commit: incidents.commit,
        workflowName: incidents.workflowName,
        workflowRunId: incidents.workflowRunId,
        failedStep: incidents.failedStep,
        status: incidents.status,
        confidence: incidents.confidence,
        rootCause: incidents.rootCause,
        triggeredAt: incidents.triggeredAt,
        createdAt: incidents.createdAt,
      })
      .from(incidents)
      .where(whereClause)
      .orderBy(desc(incidents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(incidents).where(whereClause),
  ])

  return c.json({ incidents: rows, total })
})

incidentsRouter.get('/incidents/:id', async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('orgId')!

  const incident = await db.query.incidents.findFirst({
    where: (t, { and: a, eq: e }) => a(e(t.id, id), e(t.orgId, orgId)),
  })

  if (!incident) return c.json({ error: 'Incident not found' }, 404)

  const [calls, actions] = await Promise.all([
    db
      .select({
        id: toolCalls.id,
        integration: toolCalls.integration,
        round: toolCalls.round,
        durationMs: toolCalls.durationMs,
        createdAt: toolCalls.createdAt,
      })
      .from(toolCalls)
      .where(eq(toolCalls.incidentId, id)),
    db
      .select({
        id: incidentActions.id,
        incidentId: incidentActions.incidentId,
        actionType: incidentActions.actionType,
        performedBy: incidentActions.performedBy,
        metadata: incidentActions.metadata,
        createdAt: incidentActions.createdAt,
      })
      .from(incidentActions)
      .where(eq(incidentActions.incidentId, id))
      .orderBy(desc(incidentActions.createdAt)),
  ])

  return c.json({ incident, toolCalls: calls, actions })
})

incidentsRouter.patch('/incidents/:id/status', async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('orgId')!
  const user = c.get('user')

  // Verify ownership before mutating
  const [exists] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.orgId, orgId)))
    .limit(1)
  if (!exists) return c.json({ error: 'Incident not found' }, 404)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = UpdateIncidentStatusSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const result = await updateIncidentStatus(id, parsed.data.status, user?.id ?? null, parsed.data.snoozedUntil)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json({ id, ...result.data })
})
