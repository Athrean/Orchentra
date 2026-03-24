import { tool } from 'ai'
import { z } from 'zod'
import { Octokit } from '@octokit/rest'
import { config } from '../../config'

const octokit = new Octokit({ auth: config.github.token })

const MAX_LOG_LINES = 300

export const githubActionsTool = tool({
  description:
    'Fetch GitHub Actions workflow run logs for a failed CI run. ' +
    'Returns the last 300 lines of the failed step logs, the job name, failed step name, and duration.',
  parameters: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    runId: z.number().describe('The workflow run ID from the webhook payload'),
  }),
  execute: async ({ owner, repo, runId }) => {
    try {
      const { data } = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
      })

      const failedJob = data.jobs.find((j) => j.conclusion === 'failure')
      if (!failedJob) {
        return { error: 'No failed job found in this workflow run' }
      }

      const { data: logsData } = await octokit.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: failedJob.id,
      })

      const rawLogs = typeof logsData === 'string' ? logsData : String(logsData)
      const lines = rawLogs.split('\n')
      const relevant = lines.slice(-MAX_LOG_LINES).join('\n')

      const failedStep = failedJob.steps?.find((s) => s.conclusion === 'failure')?.name ?? null

      const durationSeconds =
        failedJob.completed_at && failedJob.started_at
          ? Math.round((new Date(failedJob.completed_at).getTime() - new Date(failedJob.started_at).getTime()) / 1000)
          : null

      return {
        jobName: failedJob.name,
        failedStep,
        logs: relevant,
        durationSeconds,
      }
    } catch (err) {
      return { error: `Failed to fetch workflow logs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
})
