import { GitHubClient, GitHubApiError, resolveToken } from '@orchentra/cli-api'
import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import type { GitHubDeps } from './issues'

export interface SearchIssuesInput {
  q: string
  limit?: number
}

export interface SearchIssueItem {
  number: number
  title: string
  state: string
  repo: string
  labels: string[]
  url?: string
}

export interface SearchIssuesResult {
  totalCount: number
  items: SearchIssueItem[]
  isError: boolean
  error?: string
}

const TOKEN_HINT =
  'No GitHub token. Set ORCHENTRA_GITHUB_TOKEN, GITHUB_TOKEN, run `orchentra login`, or `gh auth login`.'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function repoFromApiUrl(apiUrl: unknown): string {
  if (typeof apiUrl !== 'string') return ''
  const m = apiUrl.match(/\/repos\/([^/]+\/[^/]+)$/)
  return m ? m[1]! : ''
}

function mapItem(raw: Record<string, unknown>): SearchIssueItem {
  const labels = Array.isArray(raw['labels'])
    ? (raw['labels'] as Array<string | { name?: string }>)
        .map((l) => (typeof l === 'string' ? l : (l?.name ?? '')))
        .filter(Boolean)
    : []
  return {
    number: Number(raw['number']),
    title: String(raw['title'] ?? ''),
    state: String(raw['state'] ?? 'open'),
    repo: repoFromApiUrl(raw['repository_url']),
    labels,
    url: typeof raw['html_url'] === 'string' ? raw['html_url'] : undefined,
  }
}

function explainError(e: unknown): string {
  if (e instanceof GitHubApiError) {
    if (e.status === 422) return `422: invalid search query. Check qualifier syntax (repo:, label:, is:). ${e.message}`
    if (e.status === 401 || e.status === 403) return `${e.status}: token rejected. ${TOKEN_HINT}`
    return `${e.status}: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export async function searchGitHubIssues(input: SearchIssuesInput, deps: GitHubDeps): Promise<SearchIssuesResult> {
  const q = input.q?.trim() ?? ''
  if (!q) return { totalCount: 0, items: [], isError: true, error: 'query is required' }
  if (!deps.token) return { totalCount: 0, items: [], isError: true, error: TOKEN_HINT }

  const client = new GitHubClient({ token: deps.token, fetchImpl: deps.fetchImpl })
  try {
    const raw = await client.request<{ total_count: number; items: Array<Record<string, unknown>> }>('/search/issues', {
      query: { q, per_page: clamp(input.limit ?? 30, 1, 100) },
    })
    return {
      totalCount: raw.total_count,
      items: raw.items.map(mapItem),
      isError: false,
    }
  } catch (e) {
    return { totalCount: 0, items: [], isError: true, error: explainError(e) }
  }
}

function defaultDeps(): GitHubDeps {
  const t = resolveToken()
  return { token: t?.token ?? null }
}

export const githubSearchIssuesTool: ToolDefinition = {
  name: 'github_search_issues',
  description:
    'Search GitHub issues + PRs across repos. q supports qualifiers like repo:owner/name, label:frontend, is:issue, is:open, author:user. Use this for any cross-repo or label-filtered search instead of web_fetch.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      q: {
        type: 'string',
        description: 'Search query with qualifiers (e.g. "repo:Athrean/Orchentra label:frontend is:issue is:open")',
      },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Max results (default: 30)' },
    },
    required: ['q'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const result = await searchGitHubIssues(args as SearchIssuesInput, defaultDeps())
    return { content: JSON.stringify(result), isError: result.isError }
  },
}
