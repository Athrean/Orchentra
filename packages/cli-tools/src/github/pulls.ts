import { GitHubClient, GitHubApiError, resolveToken } from '@orchentra/cli-api'
import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { parseGitHubUrl } from './url'
import type { GitHubDeps } from './issues'

export interface ListPullsInput {
  repo: string
  state?: 'open' | 'closed' | 'all'
  base?: string
  head?: string
  limit?: number
}

export interface PullSummary {
  number: number
  title: string
  state: string
  draft: boolean
  base: string
  head: string
  user?: string
  url?: string
  createdAt?: string
}

export interface ListPullsResult {
  pulls: PullSummary[]
  count: number
  isError: boolean
  error?: string
}

export interface GetPullInput {
  repo: string
  number: number
}

export interface PullFileChange {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface PullDetail extends PullSummary {
  body?: string | null
  merged?: boolean
  mergeable?: boolean | null
  files: PullFileChange[]
}

export interface GetPullResult {
  pull?: PullDetail
  isError: boolean
  error?: string
}

const TOKEN_HINT =
  'No GitHub token. Set ORCHENTRA_GITHUB_TOKEN, GITHUB_TOKEN, run `orchentra login`, or `gh auth login`.'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function mapPull(raw: Record<string, unknown>): PullSummary {
  const base = (raw['base'] as { ref?: string } | undefined)?.ref ?? ''
  const head = (raw['head'] as { ref?: string } | undefined)?.ref ?? ''
  return {
    number: Number(raw['number']),
    title: String(raw['title'] ?? ''),
    state: String(raw['state'] ?? 'open'),
    draft: Boolean(raw['draft']),
    base,
    head,
    user:
      typeof raw['user'] === 'object' && raw['user'] !== null
        ? String((raw['user'] as { login?: string }).login ?? '')
        : undefined,
    url: typeof raw['html_url'] === 'string' ? raw['html_url'] : undefined,
    createdAt: typeof raw['created_at'] === 'string' ? raw['created_at'] : undefined,
  }
}

function explainError(e: unknown): string {
  if (e instanceof GitHubApiError) {
    if (e.status === 404) return `404: PR or repo not found / no access. Check owner/repo and token scope.`
    if (e.status === 401 || e.status === 403) return `${e.status}: token rejected. ${TOKEN_HINT}`
    return `${e.status}: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function listGitHubPulls(input: ListPullsInput, deps: GitHubDeps): Promise<ListPullsResult> {
  const parsed = parseGitHubUrl(input.repo)
  if (!parsed) return { pulls: [], count: 0, isError: true, error: 'repo must be owner/repo or a github.com URL' }
  if (!deps.token) return { pulls: [], count: 0, isError: true, error: TOKEN_HINT }

  const client = new GitHubClient({ token: deps.token, fetchImpl: deps.fetchImpl })
  try {
    const raw = await client.request<Array<Record<string, unknown>>>(`/repos/${parsed.owner}/${parsed.repo}/pulls`, {
      query: {
        state: input.state ?? 'open',
        base: input.base,
        head: input.head,
        per_page: clamp(input.limit ?? 30, 1, 100),
      },
    })
    const pulls = raw.map(mapPull)
    return { pulls, count: pulls.length, isError: false }
  } catch (e) {
    return { pulls: [], count: 0, isError: true, error: explainError(e) }
  }
}

export async function getGitHubPull(input: GetPullInput, deps: GitHubDeps): Promise<GetPullResult> {
  const parsed = parseGitHubUrl(input.repo)
  if (!parsed) return { isError: true, error: 'repo must be owner/repo or a github.com URL' }
  if (!Number.isInteger(input.number) || input.number <= 0) {
    return { isError: true, error: 'number must be a positive integer' }
  }
  if (!deps.token) return { isError: true, error: TOKEN_HINT }

  const client = new GitHubClient({ token: deps.token, fetchImpl: deps.fetchImpl })
  try {
    const [raw, fileRaw] = await Promise.all([
      client.request<Record<string, unknown>>(`/repos/${parsed.owner}/${parsed.repo}/pulls/${input.number}`),
      client.request<Array<Record<string, unknown>>>(
        `/repos/${parsed.owner}/${parsed.repo}/pulls/${input.number}/files`,
        { query: { per_page: 30 } },
      ),
    ])
    const summary = mapPull(raw)
    const files: PullFileChange[] = fileRaw.map((f) => ({
      filename: String(f['filename'] ?? ''),
      status: String(f['status'] ?? ''),
      additions: Number(f['additions'] ?? 0),
      deletions: Number(f['deletions'] ?? 0),
    }))
    const detail: PullDetail = {
      ...summary,
      body: typeof raw['body'] === 'string' ? raw['body'] : null,
      merged: typeof raw['merged'] === 'boolean' ? raw['merged'] : undefined,
      mergeable: raw['mergeable'] === null ? null : Boolean(raw['mergeable']),
      files,
    }
    return { pull: detail, isError: false }
  } catch (e) {
    return { isError: true, error: explainError(e) }
  }
}

function defaultDeps(): GitHubDeps {
  const t = resolveToken()
  return { token: t?.token ?? null }
}

export const githubListPullsTool: ToolDefinition = {
  name: 'github_list_pulls',
  description:
    'List GitHub pull requests for a repo. Use for any "show PRs", "list open pull requests", or pasted PR URL.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo or a github.com URL' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state (default: open)' },
      base: { type: 'string', description: 'Filter by base branch' },
      head: { type: 'string', description: 'Filter by head branch (or user:branch)' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max PRs (default: 30)' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const result = await listGitHubPulls(args as ListPullsInput, defaultDeps())
    return { content: JSON.stringify(result), isError: result.isError }
  },
}

export const githubGetPullTool: ToolDefinition = {
  name: 'github_get_pull',
  description: 'Fetch a single GitHub pull request by number, including body, mergeability, and changed files.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo or a github.com URL' },
      number: { type: 'integer', minimum: 1, description: 'PR number' },
    },
    required: ['repo', 'number'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const result = await getGitHubPull(args as GetPullInput, defaultDeps())
    return { content: JSON.stringify(result), isError: result.isError }
  },
}
