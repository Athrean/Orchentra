export const API_VERSION = '0.1.0'

export { AnthropicProvider, type AnthropicConfig } from './anthropic/client'
export { injectCacheBoundary } from './anthropic/cache'
export type {
  StreamEvent,
  Usage,
  MessageRequest,
  ToolDefinition,
  ContentBlock,
  SystemContentBlock,
  OutputContentBlock,
  ContentBlockDelta,
} from './anthropic/types'
export { SseParser } from './sse'
export {
  classifyError,
  isRetryableStatus,
  enrichAuthError,
  missingCredentialsError,
  type AnthropicApiError,
  type FailureClass,
} from './errors'
export { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from './retry'
export { validateApiKey } from './preflight'

export {
  OpenAiCompatProvider,
  XAI_CONFIG,
  OPENAI_CONFIG,
  DASHSCOPE_CONFIG,
  type OpenAiCompatConfig,
} from './openai-compat'

export { getGitHubToken, login as githubLogin, logout as githubLogout, deviceFlow } from './github/auth'
export type { DeviceFlowResult } from './github/auth'
export {
  GitHubClient,
  GitHubApiError,
  type WorkflowRun,
  type WorkflowJob,
  type WorkflowStep,
  type PullRequest,
  type CheckRun,
} from './github/client'
