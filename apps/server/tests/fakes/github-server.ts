import { Hono } from 'hono'
import type { Server } from 'bun'

export interface CapturedRequest {
  method: string
  path: string
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
  jobs?: JobShape[]
  logsByJobId?: Record<number, string>
  listJobsStatus?: number
  listJobsBody?: unknown
}

export interface FakeGitHubServer {
  baseUrl: string
  requests: CapturedRequest[]
  setScenario: (s: FakeGitHubScenario) => void
  shutdown: () => Promise<void>
}

export async function spawnFakeGitHub(): Promise<FakeGitHubServer> {
  const requests: CapturedRequest[] = []
  let scenario: FakeGitHubScenario = {}

  const app = new Hono()

  app.use('*', async (c, next) => {
    requests.push({
      method: c.req.method,
      path: c.req.path,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    })
    await next()
  })

  app.get('/repos/:owner/:repo/actions/runs/:runId/jobs', (c) => {
    if (typeof scenario.listJobsStatus === 'number' && scenario.listJobsStatus >= 400) {
      return c.json(scenario.listJobsBody ?? { message: 'fake error' }, scenario.listJobsStatus as 400 | 500)
    }
    return c.json({ total_count: scenario.jobs?.length ?? 0, jobs: scenario.jobs ?? [] })
  })

  app.get('/repos/:owner/:repo/actions/jobs/:jobId/logs', (c) => {
    const jobId = Number(c.req.param('jobId'))
    const text = scenario.logsByJobId?.[jobId] ?? ''
    return new Response(text, { status: 200, headers: { 'content-type': 'text/plain' } })
  })

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
