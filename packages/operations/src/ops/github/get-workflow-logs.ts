import { z } from 'zod'
import type { Operation } from '../../types'
import { getGitHubAdapter } from './adapter'

const MAX_LOG_LINES = 300

// Terminal non-success conclusions reported by GitHub Actions for a job/step.
// Anything in this set means "did not pass" and the logs are worth fetching.
// `null` (in_progress) and `success`/`neutral`/`skipped` are intentionally excluded.
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'])

const Params = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().describe('The workflow run ID from the webhook payload'),
})

export type GetWorkflowLogsParams = z.infer<typeof Params>

export interface WorkflowLogResult {
  jobName: string
  failedStep: string | null
  logs: string
  durationSeconds: number | null
}

export interface WorkflowLogError {
  error: string
}

export type GetWorkflowLogsResult = WorkflowLogResult | WorkflowLogError

export async function fetchFailedJobLogs(owner: string, repo: string, runId: number): Promise<GetWorkflowLogsResult> {
  const fullName = `${owner}/${repo}`
  const adapter = getGitHubAdapter()
  try {
    if (!(await adapter.isRepoAllowed(fullName))) {
      return { error: `Repository ${fullName.toLowerCase()} is not in the monitored repos list` }
    }

    const { jobs } = await adapter.listJobsForWorkflowRun({ owner, repo, runId })

    const failedJob = jobs.find((j) => j.conclusion !== null && FAILED_CONCLUSIONS.has(j.conclusion))
    if (!failedJob) {
      return { error: 'No failed job found in this workflow run' }
    }

    const rawLogs = await adapter.downloadJobLogs({ owner, repo, jobId: failedJob.id })
    const lines = rawLogs.split('\n')
    const relevant = lines.slice(-MAX_LOG_LINES).join('\n')

    const failedStep =
      failedJob.steps?.find((s) => typeof s.conclusion === 'string' && FAILED_CONCLUSIONS.has(s.conclusion))?.name ??
      null

    const durationSeconds =
      failedJob.completed_at && failedJob.started_at
        ? Math.round((new Date(failedJob.completed_at).getTime() - new Date(failedJob.started_at).getTime()) / 1000)
        : null

    return { jobName: failedJob.name, failedStep, logs: relevant, durationSeconds }
  } catch (err) {
    return { error: `Failed to fetch workflow logs: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export const getWorkflowLogsOperation: Operation<GetWorkflowLogsParams, GetWorkflowLogsResult> = {
  id: 'get_workflow_logs',
  description:
    'Fetch GitHub Actions workflow run logs for a failed CI run. ' +
    'Returns the last 300 lines of the failed job logs, the job name, failed step name, and duration.',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters: Params,
  handler: async (_ctx, params) => fetchFailedJobLogs(params.owner, params.repo, params.runId),
}
