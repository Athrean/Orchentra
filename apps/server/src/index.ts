import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { config } from './config'
import { runMigrations } from './db/client'
import { webhooksRouter } from './routes/webhooks'
import { interactionsRouter } from './routes/interactions'
import { commandsRouter } from './routes/commands'
import { apiRouter } from './routes/api'

// Config is loaded at import time — fails fast on bad orchentra.yml
console.log(`📋 Config loaded — watching repos: ${config.github.repos.join(', ')}`)

// Run database migrations on startup
await runMigrations()

const app = new Hono()

app.use('*', logger())

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Routes
app.route('/webhooks', webhooksRouter)
app.route('/slack/interactions', interactionsRouter)
app.route('/slack/commands', commandsRouter)
app.route('/api', apiRouter)

const port = parseInt(process.env.PORT ?? '3001')

console.log(`🚀 Orchentra server running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
