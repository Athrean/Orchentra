import { Hono } from 'hono'
import { getTokenUsage } from '../queries/usage'
import type { AppVariables } from '../types'

export const usageRouter = new Hono<{ Variables: AppVariables }>()

/**
 * GET /api/orgs/:orgId/usage
 *
 * Query params:
 *   repo  — optional owner/name filter
 *   from  — ISO date (default: 30 days ago)
 *   to    — ISO date (default: today)
 *
 * Returns token usage and estimated LLM cost aggregates for the org.
 */
usageRouter.get('/usage', async (c) => {
  const orgId = c.get('orgId')!
  const repo = c.req.query('repo')?.toLowerCase()
  const fromParam = c.req.query('from')
  const toParam = c.req.query('to')

  const toDate = toParam ? new Date(toParam) : new Date()
  if (isNaN(toDate.getTime())) return c.json({ error: 'Invalid to date' }, 400)

  // Normalise date-only values (e.g. "2024-01-31" → midnight UTC) to end-of-day
  // so the entire to-day is included in the query range.
  if (toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    toDate.setUTCHours(23, 59, 59, 999)
  }

  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (isNaN(fromDate.getTime())) return c.json({ error: 'Invalid from date' }, 400)
  if (fromDate >= toDate) return c.json({ error: 'from must be before to' }, 400)

  const result = await getTokenUsage(orgId, fromDate, toDate, repo)
  return c.json(result)
})
