import { Hono } from "hono"

export const webhooksRouter = new Hono()

webhooksRouter.post("/github", async (c) => {
  // TODO: Phase 1 — implement GitHub webhook handler
  return c.json({ ok: true })
})
