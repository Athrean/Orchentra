import { Hono } from "hono"

export const apiRouter = new Hono()

apiRouter.get("/incidents", async (c) => {
  // TODO: Phase 3 — implement incidents API for dashboard
  return c.json({ incidents: [] })
})

apiRouter.get("/incidents/:id", async (c) => {
  // TODO: Phase 3 — implement incident detail API
  return c.json({ incident: null })
})
