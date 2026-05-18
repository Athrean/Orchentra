import './config' // Config loaded at import time — fails fast on bad orchentra.yml
import { runMigrations, db, monitoredRepos, incidents, users } from './db/client'
import { max, eq, inArray } from 'drizzle-orm'
import { seedMonitoredRepos } from './lib/seed'
import { backfillRepoIncidents, withConcurrency } from './lib/backfill'
import { createApp } from './app'
import { createMemoryInstallHandoffStore } from './github/install-handoff-memory-store'
import { setJobQueue, startQueueWorker } from './lib/job-queue'
import { PgJobQueue } from './lib/pg-job-queue'
import { ensureServerBrainWired } from './agent/brain-adapter'

setJobQueue(new PgJobQueue())
// Bind brain ops to the real Drizzle store at boot so MCP clients get a
// working record_episode / list_episodes / runbook surface.
ensureServerBrainWired()
import {
  registerWsClient,
  unregisterWsClient,
  authenticateWsUpgrade,
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

// Shared install-handoff store: the CLI bootstrap start route writes
// pending entries; the GitHub App callback resolves them after the user
// finishes installing. Both must hit the same instance.
const handoffStore = createMemoryInstallHandoffStore({ now: () => Date.now(), ttlMs: 5 * 60 * 1000 })

const app = createApp({ handoffStore })

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
