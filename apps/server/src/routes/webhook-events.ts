import { Hono } from 'hono'
import type { AppVariables } from '../types'
import { findFailedWebhookEvents, resetWebhookForReplay } from '../queries/webhook-events'

export const webhookEventsRouter = new Hono<{ Variables: AppVariables }>()

/** List failed webhook events that can be replayed (scoped to org's monitored repos). */
webhookEventsRouter.get('/webhook-events/failed', async (c) => {
  const orgId = c.get('orgId')!
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 100)
  const provider = c.req.query('provider') ?? 'github'

  const events = await findFailedWebhookEvents(provider, orgId, limit)
  return c.json({ events })
})

/** Reset a failed webhook event to pending for replay (scoped to org's monitored repos). */
webhookEventsRouter.post('/webhook-events/:id/replay', async (c) => {
  const orgId = c.get('orgId')!
  const id = c.req.param('id')

  const updated = await resetWebhookForReplay(id, orgId)
  if (!updated) return c.json({ error: 'Not found or not in failed state' }, 404)
  return c.json({ ok: true, id })
})
