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
  RuntimeEvent,
} from './events'

export { emptyUsage, addUsage, totalTokens } from './events'

export type { PermissionMode, ToolLevel, PermissionDecision } from './permissions'
export { decide, isPermissionMode } from './permissions'

export type { BudgetConfig, BudgetState } from './budget'
export { RuntimeBudget } from './budget'

export type {
  ChatMessage,
  ProviderToolSchema,
  ProviderRequest,
  TextDelta,
  ToolUseDelta,
  UsageDelta,
  StopReason,
  FinishDelta,
  ProviderStreamEvent,
  Provider,
} from './provider'

export type { ToolContext, ToolResult, ToolDefinition, ToolRegistry } from './tools'

export type { SystemPromptInput, SystemPrompt } from './system-prompt'
export { buildSystemPrompt } from './system-prompt'

export type { SessionMeta, SessionRecord, SessionWriterOptions } from './session'
export { SessionWriter, replaySession, resolveSessionPath, defaultSessionDir } from './session'

export type { CompactionInput, CompactionResult, TokenEstimator } from './compaction'
export { shouldCompact, compact, estimateMessagesTokens, defaultEstimator } from './compaction'

export type { ConversationConfig, ConversationDeps, RunInput } from './conversation'
export { ConversationRuntime } from './conversation'
