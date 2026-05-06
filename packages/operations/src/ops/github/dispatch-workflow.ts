import { z } from 'zod'
import type { Operation } from '../../types'
import { getGithubAdapter, getRepoMonitoredCheck } from '../../adapters/github'

// `workflowId` accepts either a numeric id or a workflow filename like
// 'ci.yml'. Both shapes are how GitHub's REST API addresses a workflow.
const parameters = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  workflowId: z
    .union([z.number().int().positive(), z.string().min(1)])
    .describe('Numeric workflow id OR workflow filename (e.g., "ci.yml")'),
  ref: z.string().min(1).describe('Git ref (branch or tag) to dispatch the workflow against'),
  inputs: z
    .record(z.string())
    .optional()
    .describe('Optional inputs map passed to the workflow_dispatch event (string-valued)'),
})

type Params = z.infer<typeof parameters>

export interface DispatchWorkflowResult {
  ok: true
}

export interface DispatchWorkflowError {
  error: string
}

export const dispatchWorkflowOperation: Operation<Params, DispatchWorkflowResult | DispatchWorkflowError> = {
  id: 'dispatch_workflow',
  description:
    'Trigger a GitHub Actions workflow_dispatch event for a workflow on a given ref, with an optional inputs map. ' +
    'workflowId accepts either a numeric id or a workflow filename like "ci.yml". ' +
    'Approval-gated when invoked over a remote transport.',
  scope: 'write',
  trustClass: 'write',
  localOnly: false,
  mutating: true,
  parameters,
  cliHints: { name: 'dispatch_workflow' },
  handler: async (_ctx, { owner, repo, workflowId, ref, inputs }) => {
    const fullName = `${owner}/${repo}`
    if (!(await getRepoMonitoredCheck()(fullName))) {
      return { error: `Repository ${fullName} is not monitored` }
    }
    try {
      await getGithubAdapter().actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref,
        ...(inputs !== undefined ? { inputs } : {}),
      })
      return { ok: true }
    } catch (err) {
      return { error: `Failed to dispatch workflow: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}
