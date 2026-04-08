import { Hono } from 'hono'
import type { AppVariables } from '../types'
import { findFailedWebhookEvents, resetWebhookForReplay } from '../queries/webhook-events'

export const webhookEventsRouter = new Hono<{ Variables: AppVariables }>()

/** List failed webhook events that can be replayed. */
webhookEventsRouter.get('/webhook-events/failed', async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 100)
  const provider = c.req.query('provider') ?? 'github'

  const events = await findFailedWebhookEvents(provider, limit)
  return c.json({ events })
})

/** Reset a failed webhook event to pending for replay. */
webhookEventsRouter.post('/webhook-events/:id/replay', async (c) => {
  const id = c.req.param('id')

  await resetWebhookForReplay(id)
  return c.json({ ok: true, id })
})
