import { tool } from 'ai'
import {
  getJobLogsOperation,
  getWorkflowLogsOperation,
  getWorkflowRunJobsOperation,
  getWorkflowRunOperation,
  listWorkflowRunsOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
} from '@orchentra/operations'
import {
  fetchFailedJobLogs as fetchFailedJobLogsImpl,
  type GetWorkflowLogsResult,
  type WorkflowLogError as OpWorkflowLogError,
  type WorkflowLogResult as OpWorkflowLogResult,
} from '@orchentra/operations/ops/github/get-workflow-logs'
import { ensureServerOperationsWired } from '../operations-adapter'
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

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

const localCtx = { remote: false as const, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

/**
 * Re-bind the operations-package adapters to the live server modules on every
 * call. Done per-call (not at module load) so bun:test mock.module overrides
 * that redefine these modules after import still get picked up — same pattern
 * as github-repo.ts / github-issues.ts.
 */
function bindOpsAdapters(): void {
  setGithubAdapter(getOctokit() as unknown as GithubAdapter)
  setRepoMonitoredCheck((fullName) => isRepoMonitored(fullName))
}

export const listWorkflowRunsTool = tool({
  description: listWorkflowRunsOperation.description,
  parameters: listWorkflowRunsOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return listWorkflowRunsOperation.handler(localCtx, args)
  },
})

export const getWorkflowRunTool = tool({
  description: getWorkflowRunOperation.description,
  parameters: getWorkflowRunOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getWorkflowRunOperation.handler(localCtx, args)
  },
})

export const getWorkflowRunJobsTool = tool({
  description: getWorkflowRunJobsOperation.description,
  parameters: getWorkflowRunJobsOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getWorkflowRunJobsOperation.handler(localCtx, args)
  },
})

export const getJobLogsTool = tool({
  description: getJobLogsOperation.description,
  parameters: getJobLogsOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getJobLogsOperation.handler(localCtx, args)
  },
})
