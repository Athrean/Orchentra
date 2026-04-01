import { Hono } from 'hono'
import { isRepoMonitored } from '../lib/repo-cache'
import { listWorkflows, listWorkflowRuns, dispatchWorkflow, cancelWorkflowRun } from '../lib/github-workflows'
import type { AppVariables } from '../types'

export const workflowsRouter = new Hono<{ Variables: AppVariables }>()

/** Validate that a repo param exists, is in owner/repo format, and is monitored by the org. */
async function resolveMonitoredRepo(
  repoParam: string | undefined,
): Promise<{ repo: string } | { error: string; status: 400 | 403 | 404 }> {
  if (!repoParam || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repoParam)) {
    return { error: 'repo param must be in owner/name format', status: 400 }
  }
  const lower = repoParam.toLowerCase()
  if (!(await isRepoMonitored(lower))) {
    return { error: 'Repository is not monitored by this org', status: 403 }
  }
  return { repo: lower }
}

/**
 * GET /api/orgs/:orgId/workflows?repo=owner/name
 * List all workflow definitions with latest run status.
 */
workflowsRouter.get('/workflows', async (c) => {
  const resolved = await resolveMonitoredRepo(c.req.query('repo'))
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  const result = await listWorkflows(resolved.repo)
  if ('error' in result) return c.json({ error: result.error }, (result.status ?? 500) as 500)

  return c.json({ workflows: result })
})

/**
 * GET /api/orgs/:orgId/workflows/:workflowId/runs?repo=owner/name
 * List recent runs for a specific workflow.
 */
workflowsRouter.get('/workflows/:workflowId/runs', async (c) => {
  const resolved = await resolveMonitoredRepo(c.req.query('repo'))
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  const workflowId = parseInt(c.req.param('workflowId'), 10)
  if (isNaN(workflowId)) return c.json({ error: 'Invalid workflowId' }, 400)

  const perPage = Math.min(Math.max(parseInt(c.req.query('perPage') ?? '', 10) || 20, 1), 30)

  const result = await listWorkflowRuns(resolved.repo, workflowId, perPage)
  if ('error' in result) return c.json({ error: result.error }, (result.status ?? 500) as 500)

  return c.json({ runs: result })
})

/**
 * POST /api/orgs/:orgId/workflows/:workflowId/dispatch
 * Trigger a workflow_dispatch event.
 * Body: { repo: string, ref: string, inputs?: Record<string, string> }
 */
workflowsRouter.post('/workflows/:workflowId/dispatch', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const {
    repo: repoParam,
    ref,
    inputs,
  } = body as {
    repo?: string
    ref?: string
    inputs?: Record<string, string>
  }

  const resolved = await resolveMonitoredRepo(repoParam)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  if (!ref || typeof ref !== 'string') return c.json({ error: 'ref is required' }, 400)

  const workflowId = parseInt(c.req.param('workflowId'), 10)
  if (isNaN(workflowId)) return c.json({ error: 'Invalid workflowId' }, 400)

  const result = await dispatchWorkflow(resolved.repo, workflowId, ref, inputs)
  if ('error' in result) return c.json({ error: result.error }, (result.status ?? 500) as 500)

  return c.json({ dispatched: true }, 202)
})

/**
 * POST /api/orgs/:orgId/workflows/runs/:runId/cancel
 * Cancel an in-progress workflow run.
 * Body: { repo: string }
 */
workflowsRouter.post('/workflows/runs/:runId/cancel', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { repo: repoParam } = body as { repo?: string }
  const resolved = await resolveMonitoredRepo(repoParam)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)

  const runId = parseInt(c.req.param('runId'), 10)
  if (isNaN(runId)) return c.json({ error: 'Invalid runId' }, 400)

  const result = await cancelWorkflowRun(resolved.repo, runId)
  if ('error' in result) return c.json({ error: result.error }, (result.status ?? 500) as 500)

  return c.json({ cancelled: true }, 202)
})
