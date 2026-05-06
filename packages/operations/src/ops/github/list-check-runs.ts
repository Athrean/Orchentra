import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const DEFAULT_PER_PAGE = 30
const MAX_PER_PAGE = 100

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  ref: z.string().describe('Commit SHA, branch name, or tag for which to list check runs'),
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

export const listCheckRunsOperation: Operation<Params, unknown> = {
  id: 'list_check_runs',
  description:
    'List GitHub check runs for a specific commit ref. Each check run reports id, name, status, conclusion, ' +
    'and timing — useful for inspecting CI signal beyond Actions workflow_run (e.g. external CI providers, ' +
    'CodeQL, or Branch Protection required checks).',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_check_runs' },
  handler: async (_ctx, { owner, repo, ref, perPage, page }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().checks.listForRef({
        owner,
        repo,
        ref,
        per_page: perPage ?? DEFAULT_PER_PAGE,
        page,
      })

      const checkRuns = data.check_runs.map((cr) => ({
        id: cr.id,
        name: cr.name,
        status: cr.status,
        conclusion: cr.conclusion,
        startedAt: cr.started_at,
        completedAt: cr.completed_at,
        headSha: cr.head_sha,
        htmlUrl: cr.html_url ?? null,
      }))

      return { total: data.total_count, checkRuns }
    } catch (err) {
      return { error: `Failed to list check runs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
