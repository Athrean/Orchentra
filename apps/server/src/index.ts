import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import './config' // Config loaded at import time — fails fast on bad orchentra.yml
import { runMigrations } from './db/client'
import { seedMonitoredRepos } from './lib/seed'
import { requireAuth } from './auth/middleware'
import { authRouter } from './routes/auth'
import { webhooksRouter } from './routes/webhooks'
import { interactionsRouter } from './routes/interactions'
import { commandsRouter } from './routes/commands'
import { apiRouter } from './routes/api'
import { apiKeysRouter } from './routes/api-keys'
import { reposRouter } from './routes/repos'
import { actionsRouter } from './routes/actions'
import { streamRouter } from './routes/stream'

console.log('Config loaded')

// Run database migrations and seed on startup
await runMigrations()
await seedMonitoredRepos()

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

// Protected routes — require session cookie or API key
app.use('/api/*', requireAuth)
app.route('/api', apiRouter)
app.route('/api', actionsRouter)
app.route('/api', streamRouter)
app.route('/api/keys', apiKeysRouter)
app.route('/api/repos', reposRouter)

const port = parseInt(process.env.PORT ?? '3001')

console.log(`Orchentra server running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
