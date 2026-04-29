import { tool } from 'ai'
import { z } from 'zod'
import type { Octokit as OctokitType } from '@octokit/rest'
import { config } from '../../config'
import { isRepoMonitored } from '../../lib/repo-cache'

async function octokitClient(): Promise<OctokitType> {
  const { Octokit } = await import('@octokit/rest')
  return new Octokit({ auth: config.github.token })
}

const MAX_LOG_LINES = 300

function decodeLogsData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8')
  if (Buffer.isBuffer(data)) return data.toString('utf-8')
  return String(data)
}

export interface WorkflowLogResult {
  jobName: string
  failedStep: string | null
  logs: string
  durationSeconds: number | null
}

export interface WorkflowLogError {
  error: string
}

/** Core log-fetching logic — used by both the AI tool and the runner directly. */
export async function fetchFailedJobLogs(
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowLogResult | WorkflowLogError> {
  try {
    const fullName = `${owner}/${repo}`
    if (!(await isRepoMonitored(fullName))) {
      return { error: `Repository ${fullName.toLowerCase()} is not in the monitored repos list` }
    }

    const { data } = await (
      await octokitClient()
    ).actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId,
    })

    const failedJob = data.jobs.find((j) => j.conclusion === 'failure')
    if (!failedJob) {
      return { error: 'No failed job found in this workflow run' }
    }

    const { data: logsData } = await (
      await octokitClient()
    ).actions.downloadJobLogsForWorkflowRun({
      owner,
      repo,
      job_id: failedJob.id,
    })

    const rawLogs = decodeLogsData(logsData)
    const lines = rawLogs.split('\n')
    const relevant = lines.slice(-MAX_LOG_LINES).join('\n')

    const failedStep = failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ?? null

    const durationSeconds =
      failedJob.completed_at && failedJob.started_at
        ? Math.round((new Date(failedJob.completed_at).getTime() - new Date(failedJob.started_at).getTime()) / 1000)
        : null

    return { jobName: failedJob.name, failedStep, logs: relevant, durationSeconds }
  } catch (err) {
    return { error: `Failed to fetch workflow logs: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export const githubActionsTool = tool({
  description:
    'Fetch GitHub Actions workflow run logs for a failed CI run. ' +
    'Returns the last 300 lines of the failed job logs, the job name, failed step name, and duration.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    runId: z.number().describe('The workflow run ID from the webhook payload'),
  }),
  execute: async ({ owner, repo, runId }) => fetchFailedJobLogs(owner, repo, runId),
})
