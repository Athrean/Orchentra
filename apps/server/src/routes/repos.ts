import { Hono } from 'hono'
import { MonitorRepoRequestSchema } from '@orchentra/core'
import { getAvailableRepos, invalidateMonitoredReposCache } from '../lib/repo-cache'
import { getOrgMonitoredRepos, insertMonitoredRepo, deleteMonitoredRepo } from '../queries/repos'
import type { AppVariables } from '../types'

export const reposRouter = new Hono<{ Variables: AppVariables }>()

reposRouter.get('/available', async (c) => {
  const orgId = c.get('orgId')!

  const [available, orgMonitoredRows] = await Promise.all([getAvailableRepos(), getOrgMonitoredRepos(orgId)])

  const monitored = new Set(orgMonitoredRows.map((r) => r.repo.toLowerCase()))

  const repos = available.map((repo) => ({
    ...repo,
    monitored: monitored.has(repo.fullName.toLowerCase()),
  }))

  return c.json({ repos })
})

reposRouter.post('/monitor', async (c) => {
  const orgId = c.get('orgId')!
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
  await insertMonitoredRepo(orgId, normalizedRepo, user.id)

  invalidateMonitoredReposCache()
  return c.json({ repo: normalizedRepo }, 201)
})

reposRouter.delete('/monitor', async (c) => {
  const orgId = c.get('orgId')!

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const parsed = MonitorRepoRequestSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400)

  const normalizedRepo = parsed.data.repo.toLowerCase()

  const deleted = await deleteMonitoredRepo(orgId, normalizedRepo)

  if (deleted.length === 0) return c.json({ error: 'Repo not found in your organization' }, 404)

  invalidateMonitoredReposCache()
  return c.body(null, 204)
})
