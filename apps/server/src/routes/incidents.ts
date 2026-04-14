import { Hono } from 'hono'
import { streamText } from 'ai'
import { UpdateIncidentStatusSchema } from '@orchentra/core'
import { updateIncidentStatus } from '../actions/handlers'
import { listIncidents, findIncident, findIncidentForOrg, getIncidentRelations } from '../queries/incidents'
import { createModel } from '../agent/llm'
import type { AppVariables } from '../types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const incidentsRouter = new Hono<{ Variables: AppVariables }>()

incidentsRouter.get('/incidents', async (c) => {
  const orgId = c.get('orgId')!
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 100)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '', 10) || 0, 0)
  const repo = c.req.query('repo')?.toLowerCase()
  const fromParam = c.req.query('from')
  const toParam = c.req.query('to')

  const fromDate = fromParam ? new Date(fromParam) : null
  const toDate = toParam ? new Date(toParam) : null

  if (fromDate && isNaN(fromDate.getTime())) return c.json({ error: 'Invalid from date' }, 400)
  if (toDate && isNaN(toDate.getTime())) return c.json({ error: 'Invalid to date' }, 400)

  const [rows, totals] = await listIncidents(orgId, limit, offset, repo, fromDate, toDate)
  const total = totals[0]?.total ?? 0

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

/**
 * POST /api/orgs/:orgId/incidents/:id/summarize
 *
 * Streams an LLM-generated plain-English summary of the incident.
 */
incidentsRouter.post('/incidents/:id/summarize', async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('orgId')!

  const incident = await findIncident(id, orgId)
  if (!incident) return c.json({ error: 'Incident not found' }, 404)

  const [calls] = await getIncidentRelations(id)

  const incidentContext = [
    `Workflow: ${incident.workflowName}`,
    `Repo: ${incident.repo}`,
    `Branch: ${incident.branch}`,
    `Commit: ${incident.commit.slice(0, 12)}`,
    incident.commitMessage ? `Commit message: ${incident.commitMessage}` : null,
    `Status: ${incident.status}`,
    incident.failedStep ? `Failed step: ${incident.failedStep}` : null,
    incident.rootCause ? `Root cause: ${incident.rootCause}` : null,
    incident.suggestedFix ? `Suggested fix: ${incident.suggestedFix}` : null,
    incident.confidence != null ? `Confidence: ${Math.round(incident.confidence * 100)}%` : null,
    calls.length > 0
      ? `Agent activity: ${calls.length} tool calls (${calls.map((tc) => tc.integration).join(', ')})`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const result = streamText({
    model: createModel(),
    system: `You are a concise CI/CD incident analyst. Summarize incidents in 2-4 sentences, focusing on: what failed, why it likely failed, and what the developer should do next. Be direct and actionable. Do not use markdown headers or bullet points — write plain prose.`,
    messages: [{ role: 'user', content: `Summarize this CI incident:\n\n${incidentContext}` }],
  })

  return result.toDataStreamResponse()
})
