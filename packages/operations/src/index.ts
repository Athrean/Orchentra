export type {
  Operation,
  OperationContext,
  OperationScope,
  OperationCliHints,
  OperationErrorJson,
  ErrorCode,
} from './types'
export { OperationError } from './types'
export { dispatch } from './dispatch'
export {
  setGithubAdapter,
  getGithubAdapter,
  setRepoMonitoredCheck,
  getRepoMonitoredCheck,
  type GithubAdapter,
  type RepoMonitoredCheck,
} from './adapters/github'

import type { Operation } from './types'
import { getCommitChangesOperation } from './ops/github/get-commit-changes'
import { getFileContentOperation } from './ops/github/get-file-content'

/**
 * Source-of-truth registry consumed by every transport (CLI, MCP, in-process
 * agent loop, future HTTP). Appended to as more ops migrate.
 */
export const operations: Operation[] = [getCommitChangesOperation as Operation, getFileContentOperation as Operation]
