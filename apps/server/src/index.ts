import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import './config' // Config loaded at import time — fails fast on bad orchentra.yml
import { runMigrations, db, monitoredRepos, incidents } from './db/client'
import { max } from 'drizzle-orm'
import { seedMonitoredRepos } from './lib/seed'
import { backfillRepoIncidents } from './lib/backfill'
import { requireAuth, requireOrgMember } from './auth/middleware'
import { authRouter } from './routes/auth'
import { webhooksRouter } from './routes/webhooks'
import { interactionsRouter } from './routes/interactions'
import { commandsRouter } from './routes/commands'
import { apiRouter } from './routes/api'
import { incidentsRouter } from './routes/incidents'
import { apiKeysRouter } from './routes/api-keys'
import { reposRouter } from './routes/repos'
import { actionsRouter } from './routes/actions'
import { streamRouter } from './routes/stream'
import { orgsRouter } from './routes/orgs'

console.log('Config loaded')

// Run database migrations and seed on startup
await runMigrations()
await seedMonitoredRepos()

async function syncAllRepos(): Promise<void> {
  const [allRepos, latestPerRepo] = await Promise.all([
    db.select({ repo: monitoredRepos.repo, orgId: monitoredRepos.orgId }).from(monitoredRepos),
    db
      .select({ repo: incidents.repo, latest: max(incidents.triggeredAt) })
      .from(incidents)
      .groupBy(incidents.repo),
  ])
  const latestMap = new Map(latestPerRepo.map((r) => [r.repo, r.latest]))
  for (const { repo, orgId } of allRepos) {
    backfillRepoIncidents(repo, orgId, latestMap.get(repo)).catch(console.error)
  }
}

// Incremental sync on startup — fetches only runs newer than the latest we already have
syncAllRepos().catch(console.error)

// Periodic sync every 5 minutes — keeps public repos (no webhooks) up to date
setInterval(() => syncAllRepos().catch(console.error), 5 * 60 * 1000)

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
)

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Public routes
app.route('/auth', authRouter)
app.route('/webhooks', webhooksRouter)
app.route('/slack/interactions', interactionsRouter)
app.route('/slack/commands', commandsRouter)

// All /api/* routes require authentication
app.use('/api/*', requireAuth)

// Org-scoped routes additionally require org membership
// requireOrgMember reads :orgId from the URL and verifies the user belongs to that org
// Both patterns needed: wildcard covers /api/orgs/:orgId/anything, exact covers /api/orgs/:orgId itself
app.use('/api/orgs/:orgId', requireOrgMember)
app.use('/api/orgs/:orgId/*', requireOrgMember)

// Non-org API routes
app.route('/api', apiRouter) // GET /api/me
app.route('/api/keys', apiKeysRouter)

// Org-scoped API routes — all live under /api/orgs/:orgId/
// streamRouter must be registered before incidentsRouter: /incidents/:id would otherwise match /incidents/stream
app.route('/api/orgs/:orgId', streamRouter) // SSE stream
app.route('/api/orgs/:orgId', incidentsRouter) // incidents CRUD
app.route('/api/orgs/:orgId', actionsRouter) // incident actions
app.route('/api/orgs/:orgId/repos', reposRouter) // repo management
app.route('/api/orgs/:orgId', orgsRouter) // org + member management

const port = parseInt(process.env.PORT ?? '3001')

console.log(`Orchentra server running on port ${port}`)

export default {
  port,
  idleTimeout: 0,
  fetch: app.fetch,
}
