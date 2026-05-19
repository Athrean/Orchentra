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

export interface ToolResultPayload {
  id: string
  content: string
  isError: boolean
}

export type DoneReason = 'stop' | 'budget_exhausted' | 'aborted' | 'error' | 'max_steps'

export interface TextEvent {
  kind: 'text'
  delta: string
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
  | TextEvent
  | ReasoningEvent
  | ToolUseEvent
  | ToolArgsDeltaEvent
  | ToolResultEvent
  | UsageEvent
  | CompactedEvent
  | ErrorEvent
  | DoneEvent
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
