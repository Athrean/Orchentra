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
  fetchPostJson: (path: string, body: unknown) => Promise<unknown>
  fetchPatchJson: (path: string, body: unknown) => Promise<unknown>
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
  async function fetchWithBody(path: string, body: unknown, method: 'POST' | 'PATCH'): Promise<unknown> {
    const r = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} at ${path}`)
    return r.json()
  }

  return {
    baseUrl,
    headers,
    fetchJson,
    fetchText,
    fetchPostJson: (path, body) => fetchWithBody(path, body, 'POST'),
    fetchPatchJson: (path, body) => fetchWithBody(path, body, 'PATCH'),
  }
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

export function buildLowercaseGithubAdapter(): GithubAdapter {
  const { fetchJson, fetchText, fetchPostJson, fetchPatchJson, baseUrl, headers } = buildGitHubFetchers()

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

  async function fetchVoid(path: string, init: { method: 'POST' | 'DELETE'; body?: unknown }): Promise<void> {
    const reqHeaders: Record<string, string> = { ...headers }
    let bodyInit: string | undefined
    if (init.body !== undefined) {
      reqHeaders['content-type'] = 'application/json'
      bodyInit = JSON.stringify(init.body)
    }
    const r = await fetch(`${baseUrl}${path}`, { method: init.method, headers: reqHeaders, body: bodyInit })
    if (!r.ok) throw new Error(`GitHub ${r.status} ${r.statusText} at ${path}`)
  }

  async function fetchPutJson(path: string, body: unknown): Promise<unknown> {
    const r = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`GitHub PUT ${r.status} ${r.statusText} at ${path}`)
    const text = await r.text()
    return text.length > 0 ? JSON.parse(text) : null
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
      create: async ({ owner, repo, title, head, base, body, draft, maintainer_can_modify }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/pulls`, {
          title,
          head,
          base,
          body,
          draft,
          maintainer_can_modify,
        })) as Awaited<ReturnType<GithubAdapter['pulls']['create']>>['data'],
      }),
      requestReviewers: async ({ owner, repo, pull_number, reviewers, team_reviewers }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/pulls/${pull_number}/requested_reviewers`, {
          reviewers,
          team_reviewers,
        })) as Awaited<ReturnType<GithubAdapter['pulls']['requestReviewers']>>['data'],
      }),
      merge: async ({ owner, repo, pull_number, commit_title, commit_message, sha, merge_method }) => ({
        data: (await fetchPutJson(`/repos/${owner}/${repo}/pulls/${pull_number}/merge`, {
          commit_title,
          commit_message,
          sha,
          merge_method,
        })) as Awaited<ReturnType<GithubAdapter['pulls']['merge']>>['data'],
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
      create: async ({ owner, repo, title, body, labels, assignees }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/issues`, {
          title,
          body,
          labels,
          assignees,
        })) as Awaited<ReturnType<GithubAdapter['issues']['create']>>['data'],
      }),
      update: async ({ owner, repo, issue_number, title, body, state, labels, assignees }) => ({
        data: (await fetchPatchJson(`/repos/${owner}/${repo}/issues/${issue_number}`, {
          title,
          body,
          state,
          labels,
          assignees,
        })) as Awaited<ReturnType<GithubAdapter['issues']['update']>>['data'],
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
      createCommitStatus: async ({ owner, repo, sha, state, target_url, description, context }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/statuses/${encodeURIComponent(sha)}`, {
          state,
          target_url,
          description,
          context,
        })) as Awaited<ReturnType<GithubAdapter['repos']['createCommitStatus']>>['data'],
      }),
      createOrUpdateFileContents: async ({ owner, repo, path, message, content, branch, sha }) => ({
        data: (await fetchPutJson(
          `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
          { message, content, branch, sha },
        )) as Awaited<ReturnType<GithubAdapter['repos']['createOrUpdateFileContents']>>['data'],
      }),
    },
    git: {
      createRef: async ({ owner, repo, ref, sha }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/git/refs`, { ref, sha })) as Awaited<
          ReturnType<GithubAdapter['git']['createRef']>
        >['data'],
      }),
    },
    checks: {
      listForRef: async ({ owner, repo, ref, per_page, page }) => ({
        data: (await fetchJson(
          `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs${qs({ per_page, page })}`,
        )) as Awaited<ReturnType<GithubAdapter['checks']['listForRef']>>['data'],
      }),
      create: async ({ owner, repo, name, head_sha, status, conclusion, details_url, output }) => ({
        data: (await fetchPostJson(`/repos/${owner}/${repo}/check-runs`, {
          name,
          head_sha,
          status,
          conclusion,
          details_url,
          output,
        })) as Awaited<ReturnType<GithubAdapter['checks']['create']>>['data'],
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
      // Slice 7 — mutating Actions endpoints. All return 204 No Content.
      reRunWorkflow: async ({ owner, repo, run_id, enable_debug_logging }) =>
        fetchVoid(`/repos/${owner}/${repo}/actions/runs/${run_id}/rerun`, {
          method: 'POST',
          ...(enable_debug_logging !== undefined ? { body: { enable_debug_logging } } : {}),
        }),
      reRunWorkflowFailedJobs: async ({ owner, repo, run_id, enable_debug_logging }) =>
        fetchVoid(`/repos/${owner}/${repo}/actions/runs/${run_id}/rerun-failed-jobs`, {
          method: 'POST',
          ...(enable_debug_logging !== undefined ? { body: { enable_debug_logging } } : {}),
        }),
      cancelWorkflowRun: async ({ owner, repo, run_id }) =>
        fetchVoid(`/repos/${owner}/${repo}/actions/runs/${run_id}/cancel`, { method: 'POST' }),
      createWorkflowDispatch: async ({ owner, repo, workflow_id, ref, inputs }) =>
        fetchVoid(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(String(workflow_id))}/dispatches`, {
          method: 'POST',
          body: { ref, ...(inputs !== undefined ? { inputs } : {}) },
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

export function buildRepoMonitoredCheck(allowedRepos: Set<string> | null): RepoMonitoredCheck {
  return async (fullName) => {
    if (!allowedRepos) return true
    return allowedRepos.has(fullName.toLowerCase())
  }
}

export function parseAllowedRepos(raw: string | undefined): Set<string> | null {
  if (!raw) return null
  const items = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
  return items.length > 0 ? new Set(items) : null
}
