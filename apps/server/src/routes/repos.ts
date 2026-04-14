import { Hono } from 'hono'
import { Octokit } from '@octokit/rest'
import { MonitorRepoRequestSchema } from '@orchentra/core'
import { getAvailableRepos, invalidateMonitoredReposCache } from '../lib/repo-cache'
import { getOrgMonitoredRepos, insertMonitoredRepo, deleteMonitoredRepo } from '../queries/repos'
import { backfillRepoIncidents } from '../lib/backfill'
import { config } from '../config'
import type { AppVariables } from '../types'

export const reposRouter = new Hono<{ Variables: AppVariables }>()

const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

reposRouter.get('/validate', async (c) => {
  const repoParam = c.req.query('repo')
  if (!repoParam || !REPO_PATTERN.test(repoParam)) {
    return c.json({ valid: false, error: 'Expected owner/repo format' }, 400)
  }
  const [owner, repoName] = repoParam.split('/')
  try {
    const octokit = new Octokit({ auth: config.github.token })
    const { data } = await octokit.repos.get({ owner, repo: repoName })
    // Don't expose private repo metadata to the caller
    if (data.private) return c.json({ valid: false })
    return c.json({
      valid: true,
      repo: { fullName: data.full_name, description: data.description ?? null, private: false },
    })
  } catch {
    return c.json({ valid: false })
  }
})

reposRouter.get('/available', async (c) => {
  const orgId = c.get('orgId')!
  const user = c.get('user')

  const [available, orgMonitoredRows] = await Promise.all([
    getAvailableRepos(user.githubAccessToken),
    getOrgMonitoredRepos(orgId),
  ])

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

  const normalizedRepo = parsed.data.repo.toLowerCase()
  const available = await getAvailableRepos(user.githubAccessToken).catch(() => getAvailableRepos())
  const inAccount = available.some((r) => r.fullName.toLowerCase() === normalizedRepo)

  if (!inAccount) {
    // Allow any public repo — validate it exists via GitHub API
    const [owner, repoName] = normalizedRepo.split('/')
    if (!owner || !repoName) return c.json({ error: 'Invalid repo format' }, 400)
    try {
      const octokit = new Octokit({ auth: user.githubAccessToken ?? config.github.token })
      const { data } = await octokit.repos.get({ owner, repo: repoName })
      if (data.private) return c.json({ error: 'Cannot monitor private repos outside your account' }, 403)
    } catch {
      return c.json({ error: 'Repository not found' }, 404)
    }
  }

  await insertMonitoredRepo(orgId, normalizedRepo, user.id)

  invalidateMonitoredReposCache()

  // Backfill historical runs in the background — don't block the response
  // Use the user's GitHub token so we can access their repos (the app token may not have access)
  backfillRepoIncidents(normalizedRepo, orgId, null, user.githubAccessToken).catch(console.error)

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
