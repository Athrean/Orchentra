import { tool } from 'ai'
import {
  fetchFailedJobLogs as fetchFailedJobLogsImpl,
  getWorkflowLogsOperation,
  type GetWorkflowLogsResult,
  type WorkflowLogError as OpWorkflowLogError,
  type WorkflowLogResult as OpWorkflowLogResult,
} from '@orchentra/operations/ops/github/get-workflow-logs'
import { ensureServerOperationsWired } from '../operations-adapter'

ensureServerOperationsWired()

export type WorkflowLogResult = OpWorkflowLogResult
export type WorkflowLogError = OpWorkflowLogError

/** Re-exported from `@orchentra/operations` for one release per the project alias rule. */
export async function fetchFailedJobLogs(owner: string, repo: string, runId: number): Promise<GetWorkflowLogsResult> {
  return fetchFailedJobLogsImpl(owner, repo, runId)
}

/**
 * Re-exported from `@orchentra/operations` for one release per the project alias
 * rule. The original `tool()` wrapper is rebuilt here so callers that imported
 * `githubActionsTool` keep working unchanged. The shared dispatch lives in the
 * operations package; this wrapper is glue.
 */
export const githubActionsTool = tool({
  description: getWorkflowLogsOperation.description,
  parameters: getWorkflowLogsOperation.parameters,
  execute: async ({ owner, repo, runId }) => fetchFailedJobLogs(owner, repo, runId),
})
