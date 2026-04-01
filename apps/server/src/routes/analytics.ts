import { Hono } from 'hono'
import { getAnalytics } from '../queries/analytics'
import type { AppVariables } from '../types'

export const analyticsRouter = new Hono<{ Variables: AppVariables }>()

/**
 * GET /api/orgs/:orgId/analytics
 *
 * Query params:
 *   repo   — optional owner/name filter
 *   from   — ISO date (default: 30 days ago)
 *   to     — ISO date (default: now)
 *
 * Returns aggregated CI/CD health metrics for the org.
 */
analyticsRouter.get('/analytics', async (c) => {
  const orgId = c.get('orgId')!

  const repoParam = c.req.query('repo')?.toLowerCase()
  const fromParam = c.req.query('from')
  const toParam = c.req.query('to')

  const toDate = toParam ? new Date(toParam) : new Date()
  const fromDate = fromParam ? new Date(fromParam) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000) // 30d default

  if (isNaN(fromDate.getTime())) return c.json({ error: 'Invalid from date' }, 400)
  if (isNaN(toDate.getTime())) return c.json({ error: 'Invalid to date' }, 400)
  if (fromDate >= toDate) return c.json({ error: 'from must be before to' }, 400)

  const result = await getAnalytics(orgId, repoParam, fromDate, toDate)

  return c.json(result)
})
