import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('GitHub Actions workflow run id whose failed jobs should be re-run'),
  enableDebugLogging: z
    .boolean()
    .optional()
    .describe('Enable runner + step debug logging on the new attempt (default false)'),
})

type Params = z.infer<typeof parameters>

export interface RerunFailedJobsResult {
  ok: true
}

export interface RerunFailedJobsError {
  error: string
}

export const rerunFailedJobsOperation: Operation<Params, RerunFailedJobsResult | RerunFailedJobsError> = {
  id: 'rerun_failed_jobs',
  description:
    'Re-run only the failed jobs of a GitHub Actions workflow run, leaving successful jobs alone. ' +
    'Optionally enables debug logging on the new attempt. Approval-gated when invoked over a remote transport.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'rerun_failed_jobs' },
  handler: async (_ctx, { owner, repo, runId, enableDebugLogging }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.reRunWorkflowFailedJobs({
        owner,
        repo,
        run_id: runId,
        ...(enableDebugLogging !== undefined ? { enable_debug_logging: enableDebugLogging } : {}),
      })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to re-run failed jobs: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
