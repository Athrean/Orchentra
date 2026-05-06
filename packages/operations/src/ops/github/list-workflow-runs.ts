import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

// Status enum mirrors GitHub Actions' run status + conclusion vocabulary.
// Both kinds are accepted because GitHub's `?status=` query param accepts the
// union: in-flight (queued, in_progress, ...) and terminal (success, failure, ...).
// https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
const STATUS = [
  'completed',
  'action_required',
  'cancelled',
  'failure',
  'neutral',
  'skipped',
  'stale',
  'success',
  'timed_out',
  'in_progress',
  'queued',
  'requested',
  'waiting',
  'pending',
] as const

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  status: z.enum(STATUS).optional().describe('Filter by run status or conclusion'),
  branch: z.string().optional().describe('Filter to runs against this branch'),
  event: z.string().optional().describe('Filter by triggering event (push, pull_request, ...)'),
  perPage: z.number().int().min(1).max(100).optional().describe('Items per page (1-100, default 30)'),
  page: z.number().int().min(1).optional().describe('Page number (1-indexed, default 1)'),
})

type Params = z.infer<typeof parameters>

export interface ListedWorkflowRun {
  id: number
  name: string | null
  headBranch: string | null
  headSha: string
  status: string | null
  conclusion: string | null
  runAttempt: number | null
  htmlUrl: string
  createdAt: string
  updatedAt: string
  event: string | null
}

export interface ListWorkflowRunsResult {
  runs: ListedWorkflowRun[]
  totalCount: number
}

export interface ListWorkflowRunsError {
  error: string
}

export const listWorkflowRunsOperation: Operation<Params, ListWorkflowRunsResult | ListWorkflowRunsError> = {
  id: 'list_workflow_runs',
  description:
    'List GitHub Actions workflow runs for a repository, optionally filtered by status, branch, or trigger event. ' +
    'Useful for surveying recent CI activity before drilling into a specific failed run.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters,
  cliHints: { name: 'list_workflow_runs' },
  handler: async (_ctx, { owner, repo, status, branch, event, perPage, page }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      const { data } = await getGithubAdapter().actions.listWorkflowRunsForRepo({
        owner,
        repo,
        status,
        branch,
        event,
        per_page: perPage,
        page,
      })
      const runs: ListedWorkflowRun[] = data.workflow_runs.map((r) => ({
        id: r.id,
        name: r.name ?? null,
        headBranch: r.head_branch,
        headSha: r.head_sha,
        status: r.status,
        conclusion: r.conclusion,
        runAttempt: r.run_attempt ?? null,
        htmlUrl: r.html_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        event: r.event ?? null,
      }))
      return { runs, totalCount: data.total_count }
    } catch (err) {
      return { error: `Failed to list workflow runs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
