import type { Server } from 'bun'

export interface FakeJob {
  id: number
  name: string
  conclusion: 'success' | 'failure' | 'skipped' | 'cancelled' | null
  steps?: Array<{ name: string; conclusion: 'success' | 'failure' | 'skipped' | null }>
  started_at?: string | null
  completed_at?: string | null
}

export interface FakeScenario {
  jobs?: FakeJob[]
  logsByJobId?: Record<number, string>
}

export interface FakeGitHubHandle {
  baseUrl: string
  setScenario: (s: FakeScenario) => void
  shutdown: () => Promise<void>
}

/**
 * Tiny fake GitHub Actions server kept inside the CLI test boundary so the
 * subprocess test does not reach across packages. Implements only the two
 * routes get_workflow_logs needs.
 */
export async function spawnFakeGitHubForMcpTest(): Promise<FakeGitHubHandle> {
  let scenario: FakeScenario = {}

  const server: Server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url)
      const jobsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)\/jobs$/)
      if (jobsMatch) {
        return Response.json({ total_count: scenario.jobs?.length ?? 0, jobs: scenario.jobs ?? [] })
      }
      const logsMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/jobs\/(\d+)\/logs$/)
      if (logsMatch) {
        const jobId = Number(logsMatch[3])
        const text = scenario.logsByJobId?.[jobId] ?? ''
        return new Response(text, { status: 200, headers: { 'content-type': 'text/plain' } })
      }
      return Response.json({ message: 'fake-github: route not stubbed' }, { status: 404 })
    },
  })

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    setScenario: (s) => {
      scenario = s
    },
    shutdown: async () => {
      server.stop(true)
    },
  }
}
