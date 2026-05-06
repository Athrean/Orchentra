import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().int().positive().describe('GitHub Actions workflow run id to cancel'),
})

type Params = z.infer<typeof parameters>

export interface CancelWorkflowRunResult {
  ok: true
}

export interface CancelWorkflowRunError {
  error: string
}

export const cancelWorkflowRunOperation: Operation<Params, CancelWorkflowRunResult | CancelWorkflowRunError> = {
  id: 'cancel_workflow_run',
  description:
    'Cancel an in-progress GitHub Actions workflow run. No-op (returns ok) if GitHub responds with cancellation; ' +
    'errors propagate as `error`. Approval-gated when invoked over a remote transport.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'cancel_workflow_run' },
  handler: async (_ctx, { owner, repo, runId }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.cancelWorkflowRun({ owner, repo, run_id: runId })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to cancel workflow run: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
