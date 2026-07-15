export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

/**
 * A file, directory, or URL a tool produced or changed. Artifacts point at
 * side effects; read-only inspection belongs in `data`, not here.
 */
export interface ToolArtifact {
  /** Absolute path or URL of the affected thing. */
  uri: string
  kind: 'file' | 'directory' | 'url' | 'other'
  action: 'created' | 'modified' | 'deleted'
}

/**
 * Machine-checkable proof of what a tool run did or found — diff hunks, an
 * exit code, structured diagnostics. `content` remains the model-facing text;
 * evidence is for the harness (traces, completion gates, UIs) and is never
 * sent back to the provider.
 */
export interface ToolEvidence {
  /** Category, e.g. 'diff', 'exit-status', 'diagnostics', 'matches', 'arg-validation'. */
  kind: string
  /** One-line human-readable statement of what the evidence shows. */
  summary: string
  /** Structured payload backing the summary (hunks, findings, counts…). */
  detail?: unknown
}

export interface ToolResultPayload {
  id: string
  content: string
  isError: boolean
  /** Structured tool-specific payload for programmatic consumers. Not model input. */
  data?: unknown
  artifacts?: ToolArtifact[]
  evidence?: ToolEvidence[]
}

export type DoneReason =
  | 'stop'
  | 'budget_exhausted'
  | 'aborted'
  | 'error'
  | 'max_steps'
  | 'cost_exhausted'
  | 'loop_detected'
  | 'gate_failed'
  | 'quarantined'

export interface TextEvent {
  kind: 'text'
  delta: string
}

export interface UserMessageEvent {
  kind: 'user_message'
  content: string
}

export interface ReasoningEvent {
  kind: 'reasoning'
  delta: string
}

export interface ToolUseEvent {
  kind: 'tool_use'
  call: ToolCall
}

/**
 * Streaming chunk of partial JSON for a tool call's arguments. Forwarded from
 * the provider so UIs can render a live preview before the call is finalized.
 * `partialJson` is opaque text; do not JSON.parse mid-stream.
 */
export interface ToolArgsDeltaEvent {
  kind: 'tool_args_delta'
  toolUseId: string
  toolName: string
  partialJson: string
}

export interface ToolResultEvent {
  kind: 'tool_result'
  result: ToolResultPayload
}

export interface UsageEvent {
  kind: 'usage'
  step: number
  turn: UsageTotals
  cumulative: UsageTotals
}

export interface CompactedEvent {
  kind: 'compacted'
  droppedMessageCount: number
  tokensSaved: number
  summary: string
}

/** Emitted once when estimated spend first crosses the configured warn threshold. */
export interface CostWarningEvent {
  kind: 'cost_warning'
  costUsd: number
  thresholdUsd: number
  limitUsd?: number
}

/** Emitted when an oversized tool result is trimmed before entering provider input. */
export interface ToolOutputBudgetedEvent {
  kind: 'tool_output_budgeted'
  toolCallId: string
  originalChars: number
  keptChars: number
  droppedChars: number
}

/**
 * Emitted when the loop detector breaks a run: one normalized tool-call
 * signature repeated too many times within the recent-call window.
 */
export interface LoopDetectedEvent {
  kind: 'loop_detected'
  toolName: string
  signature: string
  count: number
}

/**
 * Typed record of a permission-enforcer decision for a tool call. Emitted
 * only when an enforcer actually ran — never synthesized — so traces show
 * what was allowed or denied and why.
 */
export interface PermissionDecisionEvent {
  kind: 'permission_decision'
  tool: string
  toolCallId: string
  decision: 'allow' | 'deny'
  reason?: string
}

/** Emitted when a failure→resolution memory is auto-captured after a turn. */
export interface MemorySavedEvent {
  kind: 'memory_saved'
  id: string
  signatureHash: string
}

/**
 * Emitted around a repo-local hook while it runs so the UI can show a live
 * "running hook…" row that resolves to pass/fail, instead of only surfacing
 * the hook's output after the fact.
 */
export interface HookProgressRuntimeEvent {
  kind: 'hook_progress'
  /** Stable per-invocation id so the `running` row can be updated in place. */
  id: string
  phase: 'running' | 'done'
  /** Set on `done`: whether the hook exited zero. */
  ok?: boolean
  hookEvent: 'pre_tool_use' | 'post_tool_use'
  tool: string
  command: string
}

export interface ErrorEvent {
  kind: 'error'
  message: string
  retryable: boolean
}

export interface DoneEvent {
  kind: 'done'
  reason: DoneReason
  steps: number
  usage: UsageTotals
}

/** Durable checkpoint of autonomous state, written to session + trace for resume. */
export interface RunStateEvent {
  kind: 'run_state'
  state: import('./run-state').RunState
}

/** Auditable post-work verdict. Every verifiable terminal run has one. */
export interface GateDecisionEvent {
  kind: 'gate_decision'
  decision: import('./run-state').GateDecisionRecord
}

/** Retry/re-plan/reraise result from established lane/startup failure classes. */
export interface RecoveryDecisionEvent {
  kind: 'recovery_decision'
  decision: import('./recovery').RecoveryDecision
}

export type SpanAttributeValue = string | number | boolean

export interface SpanStartEvent {
  kind: 'span_start'
  spanId: string
  parentSpanId?: string
  name: string
  startedAt: string
  attributes?: Record<string, SpanAttributeValue>
}

export interface SpanEndEvent {
  kind: 'span_end'
  spanId: string
  endedAt: string
  status: 'ok' | 'error'
  error?: string
  attributes?: Record<string, SpanAttributeValue>
}

export type RuntimeEvent =
  | UserMessageEvent
  | TextEvent
  | ReasoningEvent
  | ToolUseEvent
  | ToolArgsDeltaEvent
  | ToolResultEvent
  | UsageEvent
  | CompactedEvent
  | CostWarningEvent
  | ToolOutputBudgetedEvent
  | LoopDetectedEvent
  | PermissionDecisionEvent
  | MemorySavedEvent
  | HookProgressRuntimeEvent
  | ErrorEvent
  | DoneEvent
  | RunStateEvent
  | GateDecisionEvent
  | RecoveryDecisionEvent
  | SpanStartEvent
  | SpanEndEvent

export function emptyUsage(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
  }
}

export function totalTokens(u: UsageTotals): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens
}
