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

export {
  resolveToken,
  writeTokenFile,
  tokenFilePath,
  requireToken,
  loginWithDeviceFlow,
  MissingGitHubTokenError,
  DeviceFlowError,
  DEFAULT_SCOPES as GITHUB_DEFAULT_SCOPES,
  GitHubClient,
  GitHubApiError,
  readRateLimit,
  type ResolvedToken,
  type TokenSource,
  type LoginOptions,
  type LoginResult,
  type DeviceCodeResponse,
  type DeviceFlowConfig,
  type GitHubClientOptions,
  type GitHubRequestOptions,
  type RateLimitState,
} from './github'
