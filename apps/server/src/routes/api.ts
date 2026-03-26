import { Hono } from 'hono'
import { eq, desc, count } from 'drizzle-orm'
import { UpdateIncidentStatusSchema } from '@orchentra/core'
import { db, incidents, toolCalls, incidentActions } from '../db/client'
import { updateIncidentStatus } from '../actions/handlers'
import type { AppVariables } from '../types'

export const apiRouter = new Hono<{ Variables: AppVariables }>()

apiRouter.get('/me', (c) => {
  const user = c.get('user') as Record<string, unknown> | undefined
  if (!user) return c.json({ user: null })
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  })
})

apiRouter.get('/incidents', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '', 10) || 50, 100)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '', 10) || 0, 0)
  const repo = c.req.query('repo')

  const whereClause = repo ? eq(incidents.repo, repo) : undefined

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

apiRouter.get('/incidents/:id', async (c) => {
  const id = c.req.param('id')

  const incident = await db.query.incidents.findFirst({
    where: eq(incidents.id, id),
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

apiRouter.patch('/incidents/:id/status', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')

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
    return c.json({ error: result.error }, result.httpStatus ?? 400)
  }
  return c.json({ id, ...result.data })
})
