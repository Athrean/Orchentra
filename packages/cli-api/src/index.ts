export const API_VERSION = '0.1.0'

export { AnthropicProvider, type AnthropicConfig } from './anthropic/client'
export { injectCacheBoundary, CLAUDE_CODE_SYSTEM_PROMPT_PREFIX } from './anthropic/cache'
export {
  loginAnthropic,
  logoutAnthropic,
  resolveAnthropicAuthToken,
  readClaudeCodeFromKeychain,
  startAnthropicLogin,
  completeAnthropicLogin,
  type AnthropicLoginOptions,
  type AnthropicLoginResult,
  type AnthropicPendingLogin,
} from './anthropic/oauth'
export {
  CLAUDE_CODE_KEYCHAIN_SERVICE,
  loadClaudeCodeOauth,
  loadAllClaudeCodeOauth,
  type NamedClaudeCodeCredential,
} from './anthropic/claude-code-creds'

export { GeminiProvider, type GeminiConfig } from './gemini'
export {
  loginGemini,
  logoutGemini,
  resolveGeminiAccessToken,
  type GeminiLoginOptions,
  type GeminiLoginResult,
} from './gemini/oauth'

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
export {
  MacKeychain,
  defaultKeychainExec,
  type KeychainEntry,
  type KeychainExec,
  type KeychainExecResult,
} from './keychain'
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
  friendlyAuthErrorMessage,
  AnthropicApiError,
  type FailureClass,
} from './errors'
export { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from './retry'
export { validateApiKey } from './preflight'
export { parseToolArguments, type ParseToolArgumentsResult } from './tool-arguments'

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
  type PullRequestRef,
  type CreatePullRequestInput,
} from './github'

export { postSlashCommand, CommandHttpError, type PostSlashCommandOptions } from './orchentra/commands'
export {
  fetchExecutionGraph,
  fetchNodeLineage,
  GraphHttpError,
  type GraphNodeDto,
  type ExecutionGraphResponse,
  type NodeLineageResponse,
  type FetchExecutionGraphOptions,
  type FetchNodeLineageOptions,
} from './orchentra/graph'
export {
  resolveOrchentraConfig,
  MissingOrchentraConfigError,
  type OrchentraConfig,
  type ResolveConfigOptions,
} from './orchentra/config'
export { writeProjectSettings, type WriteProjectSettingsInput } from './orchentra/write-project-settings'
