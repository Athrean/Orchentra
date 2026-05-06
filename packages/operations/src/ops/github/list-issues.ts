import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const DEFAULT_PER_PAGE = 30
const MAX_PER_PAGE = 100

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state filter (default: open)'),
  labels: z.string().optional().describe('Comma-separated list of label names to filter by'),
  assignee: z.string().optional().describe('Filter by assignee login (use `none` for unassigned)'),
  creator: z.string().optional().describe('Filter by issue creator login'),
  since: z.string().optional().describe('ISO 8601 timestamp — only issues updated at or after this time'),
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

export const listIssuesOperation: Operation<Params, unknown> = {
  id: 'list_issues',
  description:
    'List issues on a repository, optionally filtered by state, labels, assignee, creator, or update time. ' +
    'Returns lightweight summaries (number, title, state, labels, assignee, timestamps). Note: GitHub returns PRs in this list — ' +
    'each summary carries an `isPullRequest` flag so callers can skip them.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_issues' },
  handler: async (_ctx, { owner, repo, state, labels, assignee, creator, since, perPage, page }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().issues.list({
        owner,
        repo,
        state,
        labels,
        assignee,
        creator,
        since,
        per_page: perPage ?? DEFAULT_PER_PAGE,
        page,
      })

      const issues = data.map((iss) => ({
        number: iss.number,
        title: iss.title,
        state: iss.state,
        labels:
          iss.labels?.map((l) => (typeof l === 'string' ? l : l.name)).filter((s): s is string => Boolean(s)) ?? [],
        user: iss.user?.login ?? null,
        assignee: iss.assignee?.login ?? null,
        createdAt: iss.created_at,
        updatedAt: iss.updated_at,
        isPullRequest: iss.pull_request !== undefined && iss.pull_request !== null,
      }))

      return { issues }
    } catch (err) {
      return { error: `Failed to list issues: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
