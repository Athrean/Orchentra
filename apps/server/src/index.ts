import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import './config' // Config loaded at import time — fails fast on bad orchentra.yml
import { runMigrations, db, monitoredRepos, incidents, users } from './db/client'
import { max, eq, inArray } from 'drizzle-orm'
import { seedMonitoredRepos } from './lib/seed'
import { backfillRepoIncidents, withConcurrency } from './lib/backfill'
import { requireAuth, requireOrgMember } from './auth/middleware'
import { authRouter } from './routes/auth'
import { webhooksRouter } from './routes/webhooks'
import { apiRouter } from './routes/api'
import { incidentsRouter } from './routes/incidents'
import { apiKeysRouter } from './routes/api-keys'
import { reposRouter } from './routes/repos'
import { actionsRouter } from './routes/actions'
import { orgsRouter } from './routes/orgs'
import { chatRouter } from './routes/chat'
import { workflowsRouter } from './routes/workflows'
import { analyticsRouter } from './routes/analytics'
import { usageRouter } from './routes/usage'
import { webhookEventsRouter } from './routes/webhook-events'
import { startQueueWorker } from './lib/incident-queue'
import {
  registerWsClient,
  unregisterWsClient,
  authenticateWsUpgrade,
  getWsClientCount,
  startHeartbeat,
  handlePong,
  type WsData,
} from './ws'

console.log('Config loaded')

// Run database migrations and seed on startup
await runMigrations()
await seedMonitoredRepos()

async function syncAllRepos(): Promise<void> {
  const allRepos = await db
    .select({
      repo: monitoredRepos.repo,
      orgId: monitoredRepos.orgId,
      addedBy: monitoredRepos.addedBy,
    })
    .from(monitoredRepos)

  // Scope latestPerRepo by orgId to avoid cross-org timestamp collisions
  // when multiple orgs monitor the same repo.
  const orgIds = [...new Set(allRepos.map((r) => r.orgId))]
  const latestPerRepo =
    orgIds.length > 0
      ? await db
          .select({ orgId: incidents.orgId, repo: incidents.repo, latest: max(incidents.triggeredAt) })
          .from(incidents)
          .where(inArray(incidents.orgId, orgIds))
          .groupBy(incidents.orgId, incidents.repo)
      : []
  const latestMap = new Map(latestPerRepo.map((r) => [`${r.orgId}:${r.repo}`, r.latest]))

  // Look up user tokens by repo owner when a repo was explicitly added by a user.
  // Seeded/configured repos have addedBy = null and should use the app token directly.
  const userTokens = new Map<string, string>()
  const userIds = [...new Set(allRepos.map((r) => r.addedBy).filter((userId): userId is string => Boolean(userId)))]
  for (const userId of userIds) {
    const [user] = await db.select({ token: users.githubAccessToken }).from(users).where(eq(users.id, userId)).limit(1)
    if (user?.token) userTokens.set(userId, user.token)
  }

  // Concurrency-limited parallel backfill (3 concurrent repos)
  const backfillTasks = allRepos.map(
    ({ repo, orgId, addedBy }) =>
      () =>
        backfillRepoIncidents(
          repo,
          orgId,
          latestMap.get(`${orgId}:${repo}`),
          addedBy ? userTokens.get(addedBy) : null,
        ).catch(console.error),
  )
  await withConcurrency(backfillTasks, 3)
}

// Incremental sync on startup — fetches only runs newer than the latest we already have
syncAllRepos().catch(console.error)

// Start WebSocket heartbeat — pings every 25 s, evicts unresponsive clients after 55 s
startHeartbeat()

// Start incident queue worker — processes enqueued investigate jobs with retry + dead-letter
startQueueWorker()

// Periodic sync: trailing setTimeout ensures the next run only starts after the previous finishes
function scheduleSyncAllRepos(): void {
  setTimeout(
    async () => {
      await syncAllRepos().catch(console.error)
      scheduleSyncAllRepos()
    },
    5 * 60 * 1000,
  )
}
scheduleSyncAllRepos()

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
)

// Health check — includes live WebSocket client count for observability
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString(), wsClients: getWsClientCount() }))

// Public routes
app.route('/auth', authRouter)
app.route('/webhooks', webhooksRouter)

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
app.route('/api/orgs/:orgId', incidentsRouter) // incidents CRUD
app.route('/api/orgs/:orgId', actionsRouter) // incident actions
app.route('/api/orgs/:orgId/repos', reposRouter) // repo management
app.route('/api/orgs/:orgId', orgsRouter) // org + member management
app.route('/api/orgs/:orgId', chatRouter) // natural language chat
app.route('/api/orgs/:orgId', workflowsRouter) // CI/CD workflow management
app.route('/api/orgs/:orgId', analyticsRouter) // CI/CD health analytics
app.route('/api/orgs/:orgId', usageRouter) // token usage aggregates
app.route('/api/orgs/:orgId', webhookEventsRouter) // webhook event replay

const port = parseInt(process.env.PORT ?? '3001')

console.log(`Orchentra server running on port ${port}`)

/**
 * WebSocket handlers — Bun receives the upgrade outside of Hono's request lifecycle.
 * Route pattern: /ws/orgs/:orgId  (optionally ?repo=owner/name)
 */
const wsHandlers = {
  async open(ws: import('bun').ServerWebSocket<WsData>) {
    registerWsClient(ws)
  },
  message(ws: import('bun').ServerWebSocket<WsData>, msg: string | Buffer) {
    // Only pong frames are expected from clients; ignore everything else
    try {
      const data = JSON.parse(typeof msg === 'string' ? msg : msg.toString('utf8'))
      if (data?.type === 'pong') handlePong(ws)
    } catch {
      // Malformed JSON — silently ignore
    }
  },
  close(ws: import('bun').ServerWebSocket<WsData>) {
    unregisterWsClient(ws)
  },
  error(ws: import('bun').ServerWebSocket<WsData>) {
    unregisterWsClient(ws)
  },
}

export default {
  port,
  idleTimeout: 0,

  websocket: wsHandlers,

  async fetch(req: Request, server: import('bun').Server<WsData>) {
    const url = new URL(req.url)

    // Intercept WebSocket upgrade requests before Hono.
    // Guard on the Upgrade header first so plain HTTP requests to /ws/orgs/:orgId
    // are forwarded to Hono (or returned as 426) rather than hitting the DB unnecessarily.
    const wsMatch = url.pathname.match(/^\/ws\/orgs\/([^/]+)$/)
    if (wsMatch) {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Upgrade Required', { status: 426, headers: { Upgrade: 'websocket' } })
      }

      const orgId = wsMatch[1]
      const data = await authenticateWsUpgrade(req, orgId)
      if (!data) return new Response('Unauthorized', { status: 401 })

      // upgrade() returns false only when the request has already been responded to
      const upgraded = server.upgrade(req, { data })
      if (upgraded) return undefined as unknown as Response

      // Should not reach here under normal circumstances
      return new Response('WebSocket upgrade failed', { status: 500 })
    }

    return app.fetch(req)
  },
}
