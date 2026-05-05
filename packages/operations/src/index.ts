export type {
  Operation,
  OperationCliHints,
  OperationContext,
  OperationErrorCode,
  OperationErrorPayload,
  OperationScope,
} from './types'
export { OperationError } from './types'
export { dispatch } from './dispatch'
export { operations } from './ops'
export type { GitHubAdapter, GitHubJob, GitHubJobStep, ListJobsResult } from './ops/github/adapter'
export { getGitHubAdapter, setGitHubAdapter } from './ops/github/adapter'
