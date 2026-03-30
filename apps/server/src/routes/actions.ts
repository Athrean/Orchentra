import { Hono } from 'hono'
import { z } from 'zod'
import { rerunWorkflow, createGithubIssue, createFixPR, escalateIncident } from '../actions/handlers'
import type { AppVariables } from '../types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export const actionsRouter = new Hono<{ Variables: AppVariables }>()

actionsRouter.post('/incidents/:id/rerun', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const result = await rerunWorkflow(id, user?.id ?? null)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json(result.data)
})

actionsRouter.post('/incidents/:id/issue', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const result = await createGithubIssue(id, user?.id ?? null)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json(result.data)
})

actionsRouter.post('/incidents/:id/fix-pr', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const result = await createFixPR(id, user?.id ?? null)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json(result.data)
})

actionsRouter.post('/incidents/:id/escalate', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')
  const result = await escalateIncident(id, user?.id ?? null)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json({ success: true })
})

// Extend the existing status update to support snoozedUntil
const SnoozeBodySchema = z.object({
  hours: z.number().min(1).max(72),
})

actionsRouter.post('/incidents/:id/snooze', async (c) => {
  const id = c.req.param('id')
  const user = c.get('user')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = SnoozeBodySchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const snoozedUntil = new Date(Date.now() + parsed.data.hours * 60 * 60 * 1000)

  const { updateIncidentStatus } = await import('../actions/handlers')
  const result = await updateIncidentStatus(id, 'snoozed', user?.id ?? null, snoozedUntil)

  if (!result.success) {
    return c.json({ error: result.error }, (result.httpStatus ?? 400) as ContentfulStatusCode)
  }
  return c.json({ ...result.data, snoozedUntil: snoozedUntil.toISOString() })
})
