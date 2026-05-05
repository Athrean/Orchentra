import { operations, setGitHubAdapter, type GitHubAdapter } from '@orchentra/operations'
import { startStdioServer } from '@orchentra/mcp-server'
import { CLI_NAME, CLI_VERSION } from '../version'

/**
 * Boot the stdio MCP server. Wires a fetch-based GitHub adapter using either
 * the env-configured token (production) or — when `ORCHENTRA_MCP_FAKE_GH_BASE`
 * is set — an unauthenticated adapter pointed at a test fake.
 *
 * stdio is the protocol channel, so all CLI logging MUST go to stderr.
 */
export async function runMcpServe(): Promise<number> {
  setGitHubAdapter(buildGitHubAdapter())
  process.stderr.write(`${CLI_NAME} ${CLI_VERSION} mcp-server (stdio) ready\n`)
  await startStdioServer(operations, {
    serverInfo: { name: CLI_NAME, version: CLI_VERSION },
  })
  return 0
}

function buildGitHubAdapter(): GitHubAdapter {
  const baseUrl = process.env.ORCHENTRA_MCP_FAKE_GH_BASE ?? process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com'
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
  const allowedRepos = parseAllowedRepos(process.env.ORCHENTRA_ALLOWED_REPOS)

  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  if (token) headers.authorization = `token ${token}`

  async function fetchJson(path: string): Promise<unknown> {
    const r = await fetch(`${baseUrl}${path}`, { headers })
    if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} at ${path}`)
    return r.json()
  }
  async function fetchText(path: string): Promise<string> {
    const r = await fetch(`${baseUrl}${path}`, { headers })
    if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} at ${path}`)
    return r.text()
  }

  return {
    isRepoAllowed: async (fullName) => {
      if (!allowedRepos) return true
      return allowedRepos.has(fullName.toLowerCase())
    },
    listJobsForWorkflowRun: async ({ owner, repo, runId }) => {
      const data = (await fetchJson(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)) as {
        jobs: Array<{
          id: number
          name: string
          conclusion: string | null
          steps?: Array<{ name?: string; conclusion?: string | null }>
          started_at?: string | null
          completed_at?: string | null
        }>
      }
      return { jobs: data.jobs }
    },
    downloadJobLogs: async ({ owner, repo, jobId }) => fetchText(`/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`),
  }
}

function parseAllowedRepos(raw: string | undefined): Set<string> | null {
  if (!raw) return null
  const items = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
  return items.length > 0 ? new Set(items) : null
}
