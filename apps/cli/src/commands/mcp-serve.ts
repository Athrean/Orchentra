import { operations, setGitHubAdapter, type GitHubAdapter, type Operation } from '@orchentra/operations'
import { startStdioServer } from '@orchentra/mcp-server'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { CLI_NAME, CLI_VERSION } from '../version'

export interface McpServeOptions {
  printToolsJson: boolean
}

/**
 * Shape of one entry in the MCP `tools/list` response. Mirrored exactly so
 * `--print-tools-json` output is a snapshot of `tools/list` without booting
 * the server.
 */
export interface ToolDefinitionJson {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export function buildToolsJson(ops: readonly Operation[]): ToolDefinitionJson[] {
  return ops.map((op) => ({
    name: op.id,
    description: op.description,
    inputSchema: zodToJsonSchema(op.parameters, { target: 'jsonSchema7' }) as Record<string, unknown>,
  }))
}

/**
 * Boot the stdio MCP server, OR (with `--print-tools-json`) print every
 * operation's JSONSchema and exit 0 without starting the server.
 *
 * stdio is the protocol channel, so all CLI logging MUST go to stderr.
 */
export async function runMcpServe(options: McpServeOptions = { printToolsJson: false }): Promise<number> {
  if (options.printToolsJson) {
    const tools = buildToolsJson(operations)
    process.stdout.write(JSON.stringify(tools, null, 2) + '\n')
    return 0
  }

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
