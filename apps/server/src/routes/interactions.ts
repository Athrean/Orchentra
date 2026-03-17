import { Hono } from 'hono'

export const interactionsRouter = new Hono()

interactionsRouter.post('/', async (c) => {
  // TODO: Phase 2 — implement Slack interactions handler
  return c.json({})
})
