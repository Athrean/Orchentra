import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import './config' // Config loaded at import time — fails fast on bad orchentra.yml
import { runMigrations, db, monitoredRepos, incidents } from './db/client'
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

// Backfill historical incidents for any monitored repo that has none yet
;(async () => {
  const { eq, notExists } = await import('drizzle-orm')
  const repos = await db
    .select({ repo: monitoredRepos.repo, orgId: monitoredRepos.orgId })
    .from(monitoredRepos)
    .where(notExists(db.select({ id: incidents.id }).from(incidents).where(eq(incidents.repo, monitoredRepos.repo))))
  for (const { repo, orgId } of repos) {
    backfillRepoIncidents(repo, orgId).catch(console.error)
  }
})().catch(console.error)

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
