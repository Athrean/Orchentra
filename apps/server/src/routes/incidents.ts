import { Hono } from 'hono'
import { UpdateIncidentStatusSchema } from '@orchentra/core'
import { updateIncidentStatus } from '../actions/handlers'
import { listIncidents, findIncident, findIncidentForOrg, getIncidentRelations } from '../queries/incidents'
import type { AppVariables } from '../types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const incidentsRouter = new Hono<{ Variables: AppVariables }>()

incidentsRouter.get('/incidents', async (c) => {
  const orgId = c.get('orgId')!
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 100)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '', 10) || 0, 0)
  const repo = c.req.query('repo')

  const [rows, [{ total }]] = await listIncidents(orgId, limit, offset, repo)

  return c.json({ incidents: rows, total })
})

incidentsRouter.get('/incidents/:id', async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('orgId')!

  const incident = await findIncident(id, orgId)
  if (!incident) return c.json({ error: 'Incident not found' }, 404)

  const [calls, actions] = await getIncidentRelations(id)

  return c.json({ incident, toolCalls: calls, actions })
})

incidentsRouter.patch('/incidents/:id/status', async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('orgId')!
  const user = c.get('user')

  if (!(await findIncidentForOrg(id, orgId))) return c.json({ error: 'Incident not found' }, 404)

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
