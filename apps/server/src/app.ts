/**
 * Hono app factory. Owns route mounting + middleware ordering so the same
 * wiring can be exercised by `index.ts` at boot and by integration tests
 * without triggering migrations or binding a port at import time.
 *
 * Dependencies are injected so tests can swap the install-handoff store and
 * the GitHub App callback deps for in-memory/fake implementations.
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { requireAuth, requireOrgMember } from './auth/middleware'
import { authRouter } from './routes/auth'
import { createGithubAppRouter, type GithubAppCallbackDeps } from './routes/github-app'
import { createInstallHandoffRouter } from './routes/install-handoff'
import { webhooksRouter } from './routes/webhooks'
import { apiRouter } from './routes/api'
import { incidentsRouter } from './routes/incidents'
import { apiKeysRouter } from './routes/api-keys'
import { reposRouter } from './routes/repos'
import { actionsRouter } from './routes/actions'
import { orgsRouter } from './routes/orgs'
import { chatRouter } from './routes/chat'
import { commandsRouter } from './routes/commands'
import { workflowsRouter } from './routes/workflows'
import { analyticsRouter } from './routes/analytics'
import { usageRouter } from './routes/usage'
import { webhookEventsRouter } from './routes/webhook-events'
import { approvalsRouter } from './routes/approvals'
import { getWsClientCount } from './ws'
import type { InstallHandoffStore } from './github/install-handoff-memory-store'

export interface CreateAppDeps {
  readonly handoffStore: InstallHandoffStore
  readonly githubAppOverrides?: Partial<GithubAppCallbackDeps>
}

export function createApp(deps: CreateAppDeps): Hono {
  const app = new Hono()

  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    }),
  )

  app.get('/health', (c) =>
    c.json({ status: 'ok', timestamp: new Date().toISOString(), wsClients: getWsClientCount() }),
  )

  app.route('/auth', authRouter)
  // The GitHub App callback shares the bootstrap handoff store so a
  // state-bearing callback can resolve its loopback redirect and complete
  // the handoff. Default deps wire up the prod GH HTTP calls; tests pass
  // overrides via `githubAppOverrides`.
  app.route('/auth/github/app', createGithubAppRouter({ handoffStore: deps.handoffStore, ...deps.githubAppOverrides }))
  app.route('/webhooks', webhooksRouter)

  // Anonymous bootstrap route — fresh CLI clients have no apiKey yet, so
  // this must be mounted before the `/api/*` requireAuth guard.
  app.route('/api/install-handoff', createInstallHandoffRouter({ store: deps.handoffStore }))

  app.use('/api/*', requireAuth)
  app.use('/api/orgs/:orgId', requireOrgMember)
  app.use('/api/orgs/:orgId/*', requireOrgMember)

  app.route('/api', apiRouter)
  app.route('/api/keys', apiKeysRouter)
  app.route('/api/orgs/:orgId', incidentsRouter)
  app.route('/api/orgs/:orgId', actionsRouter)
  app.route('/api/orgs/:orgId/repos', reposRouter)
  app.route('/api/orgs/:orgId', orgsRouter)
  app.route('/api/orgs/:orgId', chatRouter)
  app.route('/api/orgs/:orgId', commandsRouter)
  app.route('/api/orgs/:orgId', workflowsRouter)
  app.route('/api/orgs/:orgId', analyticsRouter)
  app.route('/api/orgs/:orgId', usageRouter)
  app.route('/api/orgs/:orgId', webhookEventsRouter)
  app.route('/api/orgs/:orgId', approvalsRouter)

  return app
}
