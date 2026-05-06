import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('GitHub Actions workflow run id to re-run'),
  enableDebugLogging: z
    .boolean()
    .optional()
    .describe('Enable runner + step debug logging on the new attempt (default false)'),
})

type Params = z.infer<typeof parameters>

export interface RerunWorkflowResult {
  ok: true
}

export interface RerunWorkflowError {
  error: string
}

export const rerunWorkflowOperation: Operation<Params, RerunWorkflowResult | RerunWorkflowError> = {
  id: 'rerun_workflow',
  description:
    'Re-run an entire GitHub Actions workflow run (every job, including ones that succeeded). ' +
    'Optionally enables debug logging on the new attempt. Approval-gated when invoked over a remote transport.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'rerun_workflow' },
  handler: async (_ctx, { owner, repo, runId, enableDebugLogging }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.reRunWorkflow({
        owner,
        repo,
        run_id: runId,
        ...(enableDebugLogging !== undefined ? { enable_debug_logging: enableDebugLogging } : {}),
      })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to re-run workflow: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
