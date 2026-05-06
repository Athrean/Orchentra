import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const DEFAULT_PER_PAGE = 30
const MAX_PER_PAGE = 100

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter (default: open)'),
  head: z.string().optional().describe('Filter by head branch in format `user:ref` or `ref`'),
  base: z.string().optional().describe('Filter by base branch name'),
  sort: z
    .enum(['created', 'updated', 'popularity', 'long-running'])
    .optional()
    .describe('Sort field (default: created)'),
  direction: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
  perPage: z
    .number()
    .int()
    .positive()
    .max(MAX_PER_PAGE)
    .optional()
    .describe(`Page size (default: ${DEFAULT_PER_PAGE}, max: ${MAX_PER_PAGE})`),
  page: z.number().int().positive().optional().describe('Page number (default: 1)'),
})

type Params = z.infer<typeof parameters>

export const listPullRequestsOperation: Operation<Params, unknown> = {
  id: 'list_pull_requests',
  description:
    'List pull requests on a repository, optionally filtered by state, head, base, sort, and direction. ' +
    'Returns lightweight summaries (number, title, state, branch refs, timestamps) — call get_pull_request for full detail.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_pull_requests' },
  handler: async (_ctx, { owner, repo, state, head, base, sort, direction, perPage, page }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().pulls.list({
        owner,
        repo,
        state,
        head,
        base,
        sort,
        direction,
        per_page: perPage ?? DEFAULT_PER_PAGE,
        page,
      })

      const prs = data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: pr.user?.login ?? null,
        base: pr.base.ref,
        head: pr.head.ref,
        draft: pr.draft ?? false,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }))

      return { prs }
    } catch (err) {
      return { error: `Failed to list PRs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
