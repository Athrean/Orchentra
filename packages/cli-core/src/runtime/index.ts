export const RUNTIME_VERSION = '0.1.0'

export type {
  UsageTotals,
  ToolCall,
  ToolResultPayload,
  DoneReason,
  UserMessageEvent,
  TextEvent,
  ToolUseEvent,
  ToolArgsDeltaEvent,
  ToolResultEvent,
  UsageEvent,
  CompactedEvent,
  HookProgressRuntimeEvent,
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
  requiredModeForLevel,
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
  EffortTier,
  TextDelta,
  ThinkingDelta,
  ThinkingSignature,
  ToolUseDelta,
  ToolArgsDelta,
  UsageDelta,
  StopReason,
  FinishDelta,
  ProviderStreamEvent,
  Provider,
} from './provider'
export { EFFORT_TIERS, isEffortTier } from './provider'

export type { TerseMode } from './terse'
export { TERSE_MODES, isTerseMode, terseModePrompt } from './terse'
export type { SpineBudgetControls, SpinePromptOptions } from './spine'
export { spinePrompt } from './spine'
export type { PlanLevel } from './plan-level'
export { PLAN_LEVELS, isPlanLevel, planLevelPrompt } from './plan-level'

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

export type { ContextFile } from './context-files'
export { collectContextFiles } from './context-files'

export type {
  ContextStats,
  SessionControl,
  SessionForkResult,
  SessionGoal,
  SessionResumeResult,
  SessionTaskSummary,
  UndoFileEditResult,
  UndoFileEditsResult,
  RewindResult,
  RewindFilePreview,
  RewindPreview,
} from './session-control'

export { rewindBoundary, countUserTurns, lineDiffStats } from './rewind'
export { groupToolSources, findDuplicateReads } from './context-breakdown'
export type { ContextBreakdown, ContextToolSource, DuplicateFileRead } from './context-breakdown'

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
export type { RetrievedToolOutput } from './session-retrieval'
export { SessionRetrieval, SessionRetrievalError } from './session-retrieval'

export type { CompactionInput, CompactionResult, TokenEstimator, LlmSummarizer } from './compaction'
export { shouldCompact, compact, compactWithSummary, estimateMessagesTokens, defaultEstimator } from './compaction'

export type { ToolOutputBudgetResult } from './tool-output-budget'
export { budgetToolOutput } from './tool-output-budget'

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
  BudgetFeatureConfig,
} from './config-types'
export { ConfigLoader, defaultConfigHome } from './config'

export type { ModelPricing, UsageCostEstimate, TerseModeUsage, SpineSavings } from './usage'
export { pricingForModel, estimateCost, formatUsd, summaryLines, UsageTracker } from './usage'

export type { SummaryCompressionBudget, SummaryCompressionResult } from './summary-compression'
export { compressSummary, compressSummaryText, defaultCompressionBudget } from './summary-compression'

export * from '../memory/index'
