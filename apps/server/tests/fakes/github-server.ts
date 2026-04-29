import { Hono } from 'hono'
import type { Server } from 'bun'
import type { Context } from 'hono'

export interface CapturedRequest {
  method: string
  path: string
  query: Record<string, string>
  body?: unknown
  headers: Record<string, string>
}

export interface JobShape {
  id: number
  name: string
  conclusion: 'success' | 'failure' | 'skipped' | 'cancelled' | null
  steps?: Array<{ name: string; conclusion: 'success' | 'failure' | 'skipped' | null }>
  started_at?: string | null
  completed_at?: string | null
}

export interface FakeGitHubScenario {
  /** Override actions.listJobsForWorkflowRun result */
  jobs?: JobShape[]
  /** Override actions.downloadJobLogsForWorkflowRun result by job id */
  logsByJobId?: Record<number, string>
  /** Force listJobs to return an error status */
  listJobsStatus?: number
  listJobsBody?: unknown
  /** Per-route override: keyed by `METHOD path-pattern` (e.g. "GET /repos/:owner/:repo/pulls/:pull_number"). */
  routes?: Record<string, RouteHandler>
}

export type RouteHandler = (c: Context) => Response | Promise<Response>

export interface FakeGitHubServer {
  baseUrl: string
  requests: CapturedRequest[]
  setScenario: (s: FakeGitHubScenario) => void
  shutdown: () => Promise<void>
}

const ROUTES: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; pattern: string }> = [
  // actions
  { method: 'GET', pattern: '/repos/:owner/:repo/actions/runs/:runId/jobs' },
  { method: 'GET', pattern: '/repos/:owner/:repo/actions/jobs/:jobId/logs' },
  { method: 'GET', pattern: '/repos/:owner/:repo/actions/runs' },
  { method: 'POST', pattern: '/repos/:owner/:repo/actions/runs/:runId/rerun-failed-jobs' },
  { method: 'POST', pattern: '/repos/:owner/:repo/actions/runs/:runId/cancel' },
  { method: 'GET', pattern: '/repos/:owner/:repo/actions/workflows' },
  { method: 'POST', pattern: '/repos/:owner/:repo/actions/workflows/:workflowId/dispatches' },
  // pulls
  { method: 'GET', pattern: '/repos/:owner/:repo/pulls/:pull_number' },
  { method: 'GET', pattern: '/repos/:owner/:repo/pulls/:pull_number/files' },
  { method: 'GET', pattern: '/repos/:owner/:repo/pulls/:pull_number/comments' },
  // issues
  { method: 'GET', pattern: '/repos/:owner/:repo/issues/:issue_number' },
  { method: 'GET', pattern: '/repos/:owner/:repo/issues/:issue_number/comments' },
  { method: 'POST', pattern: '/repos/:owner/:repo/issues/:issue_number/comments' },
  { method: 'POST', pattern: '/repos/:owner/:repo/issues' },
  { method: 'PATCH', pattern: '/repos/:owner/:repo/issues/comments/:comment_id' },
  // search
  { method: 'GET', pattern: '/search/code' },
  // repos
  { method: 'GET', pattern: '/repos/:owner/:repo/commits/:sha' },
  { method: 'GET', pattern: '/repos/:owner/:repo/commits/:sha/pulls' },
  { method: 'GET', pattern: '/repos/:owner/:repo/contents/:path{.+}' },
  { method: 'POST', pattern: '/repos/:owner/:repo/statuses/:sha' },
  // checks
  { method: 'POST', pattern: '/repos/:owner/:repo/check-runs' },
  { method: 'PATCH', pattern: '/repos/:owner/:repo/check-runs/:check_run_id' },
  // git refs
  { method: 'GET', pattern: '/repos/:owner/:repo/git/ref/:ref{.+}' },
  { method: 'POST', pattern: '/repos/:owner/:repo/git/refs' },
  { method: 'PATCH', pattern: '/repos/:owner/:repo/git/refs/:ref{.+}' },
  { method: 'GET', pattern: '/repos/:owner/:repo/git/commits/:sha' },
  { method: 'POST', pattern: '/repos/:owner/:repo/git/commits' },
  { method: 'POST', pattern: '/repos/:owner/:repo/git/blobs' },
  { method: 'POST', pattern: '/repos/:owner/:repo/git/trees' },
  // pulls create
  { method: 'POST', pattern: '/repos/:owner/:repo/pulls' },
]

export async function spawnFakeGitHub(): Promise<FakeGitHubServer> {
  const requests: CapturedRequest[] = []
  let scenario: FakeGitHubScenario = {}

  const app = new Hono()

  app.use('*', async (c, next) => {
    let body: unknown
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      try {
        body = await c.req.json()
      } catch {
        // body may be empty / non-JSON
      }
    }
    const queries = c.req.queries()
    const flatQuery: Record<string, string> = {}
    for (const [k, v] of Object.entries(queries)) {
      if (Array.isArray(v) && v.length > 0) flatQuery[k] = v[0]
    }
    requests.push({
      method: c.req.method,
      path: c.req.path,
      query: flatQuery,
      body,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    })
    await next()
  })

  // Built-in defaults: actions.listJobsForWorkflowRun + downloadJobLogsForWorkflowRun
  // These keep #210's scenario shape working without forcing every test to register
  // routes manually for the most common github-actions path.
  app.get('/repos/:owner/:repo/actions/runs/:runId/jobs', async (c) => {
    const override = scenario.routes?.[`GET ${c.req.routePath}`]
    if (override) return override(c)
    if (typeof scenario.listJobsStatus === 'number' && scenario.listJobsStatus >= 400) {
      return c.json(scenario.listJobsBody ?? { message: 'fake error' }, scenario.listJobsStatus as 400 | 500)
    }
    return c.json({ total_count: scenario.jobs?.length ?? 0, jobs: scenario.jobs ?? [] })
  })

  app.get('/repos/:owner/:repo/actions/jobs/:jobId/logs', (c) => {
    const override = scenario.routes?.[`GET ${c.req.routePath}`]
    if (override) return override(c)
    const jobId = Number(c.req.param('jobId'))
    const text = scenario.logsByJobId?.[jobId] ?? ''
    return new Response(text, { status: 200, headers: { 'content-type': 'text/plain' } })
  })

  // Register all other patterns with a generic dispatcher that consults scenario.routes.
  for (const { method, pattern } of ROUTES) {
    if (
      pattern === '/repos/:owner/:repo/actions/runs/:runId/jobs' ||
      pattern === '/repos/:owner/:repo/actions/jobs/:jobId/logs'
    ) {
      continue
    }
    const handler: RouteHandler = (c) => {
      const override = scenario.routes?.[`${method} ${c.req.routePath}`]
      if (override) return override(c)
      return c.json({ message: `fake-github: no scenario for ${method} ${pattern}` }, 501)
    }
    if (method === 'GET') app.get(pattern, handler)
    else if (method === 'POST') app.post(pattern, handler)
    else if (method === 'PATCH') app.patch(pattern, handler)
    else if (method === 'DELETE') app.delete(pattern, handler)
  }

  // Loud 404 for unmocked paths
  app.all('*', (c) => c.json({ message: 'fake-github: route not stubbed' }, 404))

  const server: Server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch })
  const baseUrl = `http://127.0.0.1:${server.port}`

  return {
    baseUrl,
    requests,
    setScenario: (s) => {
      scenario = s
    },
    shutdown: async () => {
      server.stop(true)
    },
  }
}
