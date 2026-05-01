import { GitHubClient, GitHubApiError, resolveToken } from '@orchentra/cli-api'
import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { parseGitHubUrl } from './url'

export interface GitHubDeps {
  token: string | null
  fetchImpl?: typeof fetch
}

export interface ListIssuesInput {
  repo: string
  state?: 'open' | 'closed' | 'all'
  labels?: string[]
  limit?: number
}

export interface IssueSummary {
  number: number
  title: string
  state: string
  labels: string[]
  url?: string
  user?: string
  createdAt?: string
}

export interface ListIssuesResult {
  issues: IssueSummary[]
  count: number
  isError: boolean
  error?: string
}

export interface GetIssueInput {
  repo: string
  number: number
}

export interface IssueDetail extends IssueSummary {
  body?: string | null
}

export interface GetIssueResult {
  issue?: IssueDetail
  isError: boolean
  error?: string
}

const TOKEN_HINT =
  'No GitHub token. Set ORCHENTRA_GITHUB_TOKEN, GITHUB_TOKEN, run `orchentra login`, or `gh auth login`.'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function mapIssue(raw: Record<string, unknown>): IssueSummary {
  const labels = Array.isArray(raw['labels'])
    ? (raw['labels'] as Array<string | { name?: string }>)
        .map((l) => (typeof l === 'string' ? l : (l?.name ?? '')))
        .filter(Boolean)
    : []
  return {
    number: Number(raw['number']),
    title: String(raw['title'] ?? ''),
    state: String(raw['state'] ?? 'open'),
    labels,
    url: typeof raw['html_url'] === 'string' ? raw['html_url'] : undefined,
    user:
      typeof raw['user'] === 'object' && raw['user'] !== null
        ? String((raw['user'] as { login?: string }).login ?? '')
        : undefined,
    createdAt: typeof raw['created_at'] === 'string' ? raw['created_at'] : undefined,
  }
}

function explainError(e: unknown): string {
  if (e instanceof GitHubApiError) {
    if (e.status === 404) {
      return `404: repo not found or you lack access. Verify owner/repo and that your token can see it.`
    }
    if (e.status === 401 || e.status === 403) return `${e.status}: token rejected. ${TOKEN_HINT}`
    return `${e.status}: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function listGitHubIssues(input: ListIssuesInput, deps: GitHubDeps): Promise<ListIssuesResult> {
  const parsed = parseGitHubUrl(input.repo)
  if (!parsed) return { issues: [], count: 0, isError: true, error: 'repo must be owner/repo or a github.com URL' }
  if (!deps.token) return { issues: [], count: 0, isError: true, error: TOKEN_HINT }

  const client = new GitHubClient({ token: deps.token, fetchImpl: deps.fetchImpl })
  try {
    const raw = await client.request<Array<Record<string, unknown>>>(`/repos/${parsed.owner}/${parsed.repo}/issues`, {
      query: {
        state: input.state ?? 'open',
        labels: input.labels?.length ? input.labels.join(',') : undefined,
        per_page: clamp(input.limit ?? 30, 1, 100),
      },
    })
    const issues = raw.filter((r) => !('pull_request' in r)).map(mapIssue)
    return { issues, count: issues.length, isError: false }
  } catch (e) {
    return { issues: [], count: 0, isError: true, error: explainError(e) }
  }
}

export async function getGitHubIssue(input: GetIssueInput, deps: GitHubDeps): Promise<GetIssueResult> {
  const parsed = parseGitHubUrl(input.repo)
  if (!parsed) return { isError: true, error: 'repo must be owner/repo or a github.com URL' }
  if (!Number.isInteger(input.number) || input.number <= 0) {
    return { isError: true, error: 'number must be a positive integer' }
  }
  if (!deps.token) return { isError: true, error: TOKEN_HINT }

  const client = new GitHubClient({ token: deps.token, fetchImpl: deps.fetchImpl })
  try {
    const raw = await client.request<Record<string, unknown>>(
      `/repos/${parsed.owner}/${parsed.repo}/issues/${input.number}`,
    )
    const summary = mapIssue(raw)
    const detail: IssueDetail = {
      ...summary,
      body: typeof raw['body'] === 'string' ? raw['body'] : null,
    }
    return { issue: detail, isError: false }
  } catch (e) {
    return { isError: true, error: explainError(e) }
  }
}

function defaultDeps(): GitHubDeps {
  const t = resolveToken()
  return { token: t?.token ?? null }
}

export const githubListIssuesTool: ToolDefinition = {
  name: 'github_list_issues',
  description:
    'List GitHub issues for a repo. Use for any "show issues", "find frontend bugs", or pasted GitHub URL — never web_fetch on github.com.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo or a github.com URL' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state (default: open)' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels (AND across labels)' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max issues (default: 30)' },
    },
    required: ['repo'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const result = await listGitHubIssues(args as ListIssuesInput, defaultDeps())
    return { content: JSON.stringify(result), isError: result.isError }
  },
}

export const githubGetIssueTool: ToolDefinition = {
  name: 'github_get_issue',
  description: 'Fetch a single GitHub issue (title, body, labels, state) by number.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      repo: { type: 'string', description: 'owner/repo or a github.com URL' },
      number: { type: 'integer', minimum: 1, description: 'Issue number' },
    },
    required: ['repo', 'number'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const result = await getGitHubIssue(args as GetIssueInput, defaultDeps())
    return { content: JSON.stringify(result), isError: result.isError }
  },
}
