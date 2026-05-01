export const RUNTIME_VERSION = '0.1.0'

export type {
  UsageTotals,
  ToolCall,
  ToolResultPayload,
  DoneReason,
  TextEvent,
  ToolUseEvent,
  ToolResultEvent,
  UsageEvent,
  CompactedEvent,
  ErrorEvent,
  DoneEvent,
  SpanAttributeValue,
  SpanStartEvent,
  SpanEndEvent,
  RuntimeEvent,
} from './events'

export { emptyUsage, addUsage, totalTokens } from './events'

export type {
  PermissionMode,
  ToolLevel,
  PermissionDecision,
  PermissionOverride,
  PermissionContext,
  PermissionRequest,
  PermissionPromptDecision,
  PermissionPrompter,
  PermissionOutcome,
  PermissionRuleMatcher,
  PermissionRuleConfig,
  PermissionRule,
} from './permissions'
export {
  decide,
  isPermissionMode,
  permissionModeRank,
  parseRule,
  extractPermissionSubject,
  PermissionPolicy,
} from './permissions'

export type { EnforcementResult } from './permission-enforcer'
export { PermissionEnforcer, isWithinWorkspace, isReadOnlyCommand } from './permission-enforcer'

export type {
  WorkerStatus,
  WorkerFailureKind,
  WorkerFailure,
  WorkerEventKind,
  WorkerTrustResolution,
  WorkerPromptTarget,
  StartupFailureClassification,
  StartupEvidenceBundle,
  WorkerEventPayload,
  WorkerTaskReceipt,
  WorkerEvent,
  Worker,
  WorkerReadySnapshot,
} from './worker-boot'
export { WorkerRegistry, classifyStartupFailure } from './worker-boot'

export type { BudgetConfig, BudgetState } from './budget'
export { RuntimeBudget } from './budget'

export type {
  ChatMessage,
  ProviderToolSchema,
  ProviderRequest,
  TextDelta,
  ThinkingDelta,
  ThinkingSignature,
  ToolUseDelta,
  UsageDelta,
  StopReason,
  FinishDelta,
  ProviderStreamEvent,
  Provider,
} from './provider'

export type {
  TaskHandle,
  TaskStore,
  TodoItem,
  SharedToolState,
  ToolContext,
  ToolResult,
  ToolDefinition,
  ToolRegistry,
} from './tools'

export type { SessionControl } from './session-control'

export { isKnownModel } from './model-availability'

export {
  parseFrontmatter,
  loadSkills,
  validateSkillFrontmatter,
  substituteSkillArguments,
  translateAllowedTools,
} from './skills'
export type {
  ParseFrontmatterResult,
  ParsedSkill,
  LoadError as SkillLoadError,
  LoadSkillsOptions,
  LoadSkillsResult,
  ValidatedSkillFrontmatter,
  ValidateSkillResult,
} from './skills'

export { findStreamSafeBoundary, MarkdownStreamState } from './markdown/stream-boundary'

export { InMemoryTaskStore } from './task-store'

export type { SystemPromptInput, SystemPrompt } from './system-prompt'
export { buildSystemPrompt } from './system-prompt'

export type { SessionMeta, SessionRecord, SessionWriterOptions } from './session'
export { SessionWriter, replaySession, resolveSessionPath, defaultSessionDir } from './session'

export type { CompactionInput, CompactionResult, TokenEstimator } from './compaction'
export { shouldCompact, compact, estimateMessagesTokens, defaultEstimator } from './compaction'

export type { ConversationConfig, ConversationDeps, RunInput } from './conversation'
export { ConversationRuntime } from './conversation'

export type {
  LaneEventName,
  LaneEventStatus,
  LaneFailureClass,
  EventProvenance,
  WatcherAction,
  SessionIdentity,
  LaneOwnership,
  LaneEventBlocker,
  LaneCommitProvenance,
  LaneEventMetadata,
  LaneEvent,
} from './lane-events'
export {
  makeLaneEvent,
  laneStarted,
  laneFinished,
  laneBlocked,
  laneFailed,
  laneCommitCreated,
  laneSuperseded,
  isTerminalEvent,
  computeEventFingerprint,
  dedupeTerminalEvents,
  dedupeSupersededCommitEvents,
  LaneEventBuilder,
  withSessionIdentity,
  withOwnership,
  withNudgeId,
  withFingerprint,
} from './lane-events'

export type { GitCommitEntry, GitContext } from './git-context'
export { detectGitContext, renderGitContext } from './git-context'

export type {
  HookEvent,
  HookConfig,
  HookRunResult,
  RunHookOptions,
  HookProgressEvent,
  HookProgressReporter,
} from './hooks'
export { HookRunner, HookAbortSignal } from './hooks'

export type {
  ConfigSource,
  ConfigEntry,
  RuntimeHookConfig,
  RuntimePermissionRuleConfig,
  RuntimeFeatureConfig,
  ResolvedPermissionMode,
  RuntimeConfig,
  MemoryFeatureConfig,
} from './config-types'
export { ConfigLoader, defaultConfigHome } from './config'

export type { ModelPricing, UsageCostEstimate } from './usage'
export { pricingForModel, estimateCost, formatUsd, summaryLines, UsageTracker } from './usage'

export type { SummaryCompressionBudget, SummaryCompressionResult } from './summary-compression'
export { compressSummary, compressSummaryText, defaultCompressionBudget } from './summary-compression'

export * from '../memory/index'
