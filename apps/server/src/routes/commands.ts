import { Hono } from 'hono'

export const commandsRouter = new Hono()

commandsRouter.post('/', async (c) => {
  // TODO: Phase 4 — implement slash commands
  return c.json({ response_type: 'ephemeral', text: 'Orchentra is running.' })
})
