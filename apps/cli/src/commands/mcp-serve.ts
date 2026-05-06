import {
  operations,
  setGitHubAdapter,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GitHubAdapter,
  type GithubAdapter,
  type Operation,
  type RepoMonitoredCheck,
} from '@orchentra/operations'
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
 *
 * Six of the seven exposed tools resolve through the lowercase `GithubAdapter`
 * + `RepoMonitoredCheck` surface; only `get_workflow_logs` uses the uppercase
 * `GitHubAdapter`. Both adapter surfaces must be wired here or the read ops
 * throw "GithubAdapter is not configured" at first call.
 *
 * `post_comment` is scope:'write' and the operation dispatcher rejects remote
 * write calls with `permission_denied`. That gate stays in place until a
 * future slice wires per-call creds + an approval flow over MCP.
 */
export async function runMcpServe(options: McpServeOptions = { printToolsJson: false }): Promise<number> {
  if (options.printToolsJson) {
    const tools = buildToolsJson(operations)
    process.stdout.write(JSON.stringify(tools, null, 2) + '\n')
    return 0
  }

  const allowedRepos = parseAllowedRepos(process.env.ORCHENTRA_ALLOWED_REPOS)
  setGitHubAdapter(buildGitHubAdapter(allowedRepos))
  setGithubAdapter(buildLowercaseGithubAdapter())
  setRepoMonitoredCheck(buildRepoMonitoredCheck(allowedRepos))
  process.stderr.write(`${CLI_NAME} ${CLI_VERSION} mcp-server (stdio) ready\n`)
  await startStdioServer(operations, {
    serverInfo: { name: CLI_NAME, version: CLI_VERSION },
  })
  return 0
}

interface GitHubFetchers {
  baseUrl: string
  headers: Record<string, string>
  fetchJson: (path: string) => Promise<unknown>
  fetchText: (path: string) => Promise<string>
}

function buildGitHubFetchers(): GitHubFetchers {
  const baseUrl = process.env.ORCHENTRA_MCP_FAKE_GH_BASE ?? process.env.GITHUB_API_BASE_URL ?? 'https://api.github.com'
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? ''
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

  return { baseUrl, headers, fetchJson, fetchText }
}

function buildGitHubAdapter(allowedRepos: Set<string> | null): GitHubAdapter {
  const { fetchJson, fetchText } = buildGitHubFetchers()

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

function buildLowercaseGithubAdapter(): GithubAdapter {
  const { fetchJson, fetchText, baseUrl, headers } = buildGitHubFetchers()

  function qs(params: Record<string, string | number | undefined>): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    const search = new URLSearchParams()
    for (const [k, v] of entries) search.set(k, String(v))
    return `?${search.toString()}`
  }

  async function fetchBytes(path: string): Promise<ArrayBuffer> {
    const r = await fetch(`${baseUrl}${path}`, { headers })
    if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} at ${path}`)
    return r.arrayBuffer()
  }

  return {
    pulls: {
      get: async ({ owner, repo, pull_number }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/pulls/${pull_number}`)) as Awaited<
          ReturnType<GithubAdapter['pulls']['get']>
        >['data'],
      }),
      list: async ({ owner, repo, state, head, base, sort, direction, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/pulls${qs({ state, head, base, sort, direction, per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['pulls']['list']>>['data'],
      }),
      listFiles: async ({ owner, repo, pull_number, per_page }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/pulls/${pull_number}/files${qs({ per_page })}`)) as Awaited<
          ReturnType<GithubAdapter['pulls']['listFiles']>
        >['data'],
      }),
      listReviewComments: async ({ owner, repo, pull_number, per_page }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/pulls/${pull_number}/comments${qs({ per_page })}`)) as Awaited<
          ReturnType<GithubAdapter['pulls']['listReviewComments']>
        >['data'],
      }),
    },
    issues: {
      get: async ({ owner, repo, issue_number }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/issues/${issue_number}`)) as Awaited<
          ReturnType<GithubAdapter['issues']['get']>
        >['data'],
      }),
      list: async ({ owner, repo, state, labels, assignee, creator, since, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/issues${qs({ state, labels, assignee, creator, since, per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['issues']['list']>>['data'],
      }),
      listComments: async ({ owner, repo, issue_number, per_page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/issues/${issue_number}/comments${qs({ per_page })}`,
        )) as Awaited<ReturnType<GithubAdapter['issues']['listComments']>>['data'],
      }),
    },
    repos: {
      get: async ({ owner, repo }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}`)) as Awaited<
          ReturnType<GithubAdapter['repos']['get']>
        >['data'],
      }),
      getCommit: async ({ owner, repo, ref }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`)) as Awaited<
          ReturnType<GithubAdapter['repos']['getCommit']>
        >['data'],
      }),
      getContent: async ({ owner, repo, path, ref }) => ({
        // GitHub's contents API encodes path segments individually; encoding
        // the full path with encodeURIComponent would escape '/' separators
        // and 404 the request.
        data: (await fetchJson(
          `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${qs({ ref })}`,
        )) as Awaited<ReturnType<GithubAdapter['repos']['getContent']>>['data'],
      }),
      listBranches: async ({ owner, repo, protected: isProtected, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/branches${qs({ protected: isProtected === undefined ? undefined : String(isProtected), per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['repos']['listBranches']>>['data'],
      }),
      listLanguages: async ({ owner, repo }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/languages`)) as Record<string, number>,
      }),
      getAllTopics: async ({ owner, repo }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/topics`)) as { names: string[] },
      }),
    },
    checks: {
      listForRef: async ({ owner, repo, ref, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs${qs({ per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['checks']['listForRef']>>['data'],
      }),
    },
    actions: {
      listWorkflowRunsForRepo: async ({ owner, repo, status, branch, event, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/actions/runs${qs({ status, branch, event, per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['actions']['listWorkflowRunsForRepo']>>['data'],
      }),
      getWorkflowRun: async ({ owner, repo, run_id }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/actions/runs/${run_id}`)) as Awaited<
          ReturnType<GithubAdapter['actions']['getWorkflowRun']>
        >['data'],
      }),
      listJobsForWorkflowRun: async ({ owner, repo, run_id, attempt_number }) => {
        const path =
          attempt_number !== undefined
            ? `/repos/${owner}/${repo}/actions/runs/${run_id}/attempts/${attempt_number}/jobs`
            : `/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`
        return {
          data: (await fetchJson(path)) as Awaited<
            ReturnType<GithubAdapter['actions']['listJobsForWorkflowRun']>
          >['data'],
        }
      },
      downloadJobLogsForWorkflowRun: async ({ owner, repo, job_id }) => ({
        data: await fetchText(`/repos/${owner}/${repo}/actions/jobs/${job_id}/logs`),
      }),
      listWorkflowRunArtifacts: async ({ owner, repo, run_id }) => ({
        data: (await fetchJson(`/repos/${owner}/${repo}/actions/runs/${run_id}/artifacts`)) as Awaited<
          ReturnType<GithubAdapter['actions']['listWorkflowRunArtifacts']>
        >['data'],
      }),
      downloadArtifact: async ({ owner, repo, artifact_id, archive_format }) => ({
        data: await fetchBytes(`/repos/${owner}/${repo}/actions/artifacts/${artifact_id}/${archive_format}`),
      }),
    },
    search: {
      code: async ({ q, per_page }) => ({
        data: (await fetchJson(`/search/code${qs({ q, per_page })}`)) as Awaited<
          ReturnType<GithubAdapter['search']['code']>
        >['data'],
      }),
    },
  }
}

function buildRepoMonitoredCheck(allowedRepos: Set<string> | null): RepoMonitoredCheck {
  return async (fullName) => {
    if (!allowedRepos) return true
    return allowedRepos.has(fullName.toLowerCase())
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
