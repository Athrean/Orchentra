import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { MonitorRepoRequestSchema } from '@orchentra/core'
import { db, monitoredRepos } from '../db/client'
import { getAvailableRepos, getMonitoredRepos, invalidateMonitoredReposCache } from '../lib/repo-cache'
import type { AppVariables } from '../types'

export const reposRouter = new Hono<{ Variables: AppVariables }>()

reposRouter.get('/available', async (c) => {
  const [available, monitored] = await Promise.all([getAvailableRepos(), getMonitoredRepos()])

  const repos = available.map((repo) => ({
    ...repo,
    monitored: monitored.has(repo.fullName.toLowerCase()),
  }))

  return c.json({ repos })
})

reposRouter.post('/monitor', async (c) => {
  const user = c.get('user')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = MonitorRepoRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const available = await getAvailableRepos()
  const exists = available.some((r) => r.fullName.toLowerCase() === parsed.data.repo.toLowerCase())
  if (!exists) return c.json({ error: 'Repository not accessible by server PAT' }, 403)

  const normalizedRepo = parsed.data.repo.toLowerCase()
  await db
    .insert(monitoredRepos)
    .values({ id: crypto.randomUUID(), repo: normalizedRepo, addedBy: user.id })
    .onConflictDoNothing()

  invalidateMonitoredReposCache()
  return c.json({ repo: normalizedRepo }, 201)
})

reposRouter.delete('/monitor', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = MonitorRepoRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  await db.delete(monitoredRepos).where(eq(monitoredRepos.repo, parsed.data.repo.toLowerCase()))
  invalidateMonitoredReposCache()
  return c.body(null, 204)
})
