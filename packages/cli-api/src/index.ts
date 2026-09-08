export { AnthropicProvider, toAnthropicMessages, type AnthropicConfig } from './anthropic/client'
export { injectCacheBoundary } from './anthropic/cache'

export { GeminiProvider, type GeminiConfig } from './gemini'
export { loginGemini, resolveGeminiAccessToken, type GeminiLoginOptions, type GeminiLoginResult } from './gemini/oauth'

// ---- Subscription sign-in (Claude Pro/Max, ChatGPT, Antigravity) ----
export {
  startAnthropicLogin,
  completeAnthropicLogin,
  loginAnthropic,
  logoutAnthropic,
  resolveAnthropicAuthToken,
  type AnthropicLoginOptions,
  type AnthropicLoginResult,
  type AnthropicPendingLogin,
} from './anthropic/oauth'
export {
  loginCodex,
  buildCodexAuthorizeUrl,
  completeCodexLogin,
  refreshCodexTokens,
  importCodexCliAuth,
  readCodexCliAuth,
  isCodexBackendLogin,
  logoutCodex,
  resolveCodexBackendAuth,
  resolveOpenAiApiKeyFromCodex,
  parseCodexIdToken,
  CODEX_CHATGPT_SOURCE,
  type CodexLoginOptions,
  type CodexLoginResult,
  type CodexClaims,
} from './openai/codex-oauth'
export { CodexBackendProvider, CODEX_BACKEND_URL, type CodexBackendConfig } from './openai/codex-backend'
export {
  GeminiCodeAssistProvider,
  CODE_ASSIST_ENDPOINT,
  type GeminiCodeAssistConfig,
  type CodeAssistVariant,
} from './gemini/code-assist'
export { MacKeychain, defaultKeychainExec, type KeychainExec, type KeychainEntry } from './keychain'
export {
  loginAntigravity,
  importAntigravityCliAuth,
  resolveAntigravityAccessToken,
  isAntigravityLogin,
  isAntigravityCliInstalled,
  logoutAntigravity,
  parseAntigravityCliCredential,
  unwrapGoKeyring,
  antigravityHome,
  ANTIGRAVITY_ENDPOINT,
  ANTIGRAVITY_CLI_SOURCE,
  ANTIGRAVITY_KEYCHAIN_SERVICE,
  ANTIGRAVITY_KEYCHAIN_ACCOUNT,
  type AntigravityLoginOptions,
  type AntigravityLoginResult,
} from './gemini/antigravity'
export {
  loadClaudeCodeOauth,
  loadAllClaudeCodeOauth,
  CLAUDE_CODE_KEYCHAIN_SERVICE,
} from './anthropic/claude-code-creds'
// ---- end subscription sign-in ----

export {
  credentialsPath,
  loadCredentials,
  getCredential,
  saveCredential,
  clearCredential,
  listCredentialProviders,
  resolveApiKey,
  type ProviderKey,
  type StoredCredential,
  type ResolvedApiKey,
} from './credential-store'
export {
  KEYCHAIN_SERVICE,
  tryLoadKeytar,
  saveCredentialAsync,
  getCredentialAsync,
  clearCredentialAsync,
  listCredentialProvidersAsync,
  resolveApiKeyAsync,
  type KeychainShim,
  type ResolvedApiKeyAsync,
} from './keychain-store'

export {
  generatePkce,
  generateState,
  captureLoopbackCode,
  buildAuthorizeUrl,
  type PkcePair,
  type LoopbackResult,
  type LoopbackOptions,
} from './oauth-pkce'
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
  isProviderAuthError,
  isRateLimitError,
  friendlyAuthErrorMessage,
  AnthropicApiError,
  type FailureClass,
} from './errors'
export {
  computeBackoff,
  resolveRetryConfig,
  parseRetryAfter,
  fetchWithRetry,
  DEFAULT_RETRY_CONFIG,
  RETRY_ENV_VARS,
  type RetryConfig,
} from './retry'
export { validateApiKey } from './preflight'
export { parseToolArguments, type ParseToolArgumentsResult } from './tool-arguments'

export {
  OpenAiCompatProvider,
  XAI_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  ZEN_CONFIG,
  ZEN_GO_CONFIG,
  ZEN_GO_RESPONSES_CONFIG,
  ZEN_RESPONSES_CONFIG,
  DASHSCOPE_CONFIG,
  LOCAL_CONFIG,
  type OpenAiCompatConfig,
} from './openai-compat'
export { assertModelProvenance, ModelProvenanceError } from './model-provenance'

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
  getWorkflowRun,
  listWorkflowJobs,
  getJobLogs,
  isFailingJob,
  type WorkflowRun,
  type WorkflowJob,
  type WorkflowJobStep,
  type WorkflowConclusion,
  createCheckRun,
  updateCheckRun,
  upsertCheckRun,
  findCheckRunByExternalId,
  createCommitStatus,
  listIssueComments,
  listPullReviewComments,
  createIssueComment,
  updateIssueComment,
  upsertMarkedComment,
  triageMarker,
  listPullsForCommit,
  findOpenPullByHead,
  createPullRequest,
  updatePullRequest,
  type CheckRun,
  type CheckConclusion,
  type CreateCheckRunInput,
  type CommitStatus,
  type CommitStatusInput,
  type CommitStatusState,
  type IssueComment,
  type PullReviewComment,
  type PullRequestRef,
  type CreatePullRequestInput,
} from './github'

export { ResponsesProvider, buildResponsesBody, type ResponsesConfig } from './responses/index'
