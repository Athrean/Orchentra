import type { ToolCall, UsageTotals } from './events'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ProviderToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ProviderRequest {
  systemStatic: string
  systemDynamic: string
  messages: ChatMessage[]
  tools: ProviderToolSchema[]
  model: string
  maxOutputTokens: number
  effort?: EffortTier
  thinkingTokenBudget?: number
  signal?: AbortSignal
}

export const EFFORT_TIERS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type EffortTier = (typeof EFFORT_TIERS)[number]

export function isEffortTier(value: unknown): value is EffortTier {
  return typeof value === 'string' && (EFFORT_TIERS as readonly string[]).includes(value)
}

export interface TextDelta {
  kind: 'text-delta'
  delta: string
}

export interface ThinkingDelta {
  kind: 'thinking-delta'
  delta: string
}

export interface ThinkingSignature {
  kind: 'thinking-signature'
  signature: string
}

export interface ToolUseDelta {
  kind: 'tool-use'
  call: ToolCall
}

/**
 * Streaming chunk of partial JSON for a tool call's arguments. Emitted as the
 * model produces the tool's input, before the finalized `tool-use` event.
 * Consumers should treat `partialJson` as opaque text — it is NOT guaranteed
 * to parse as JSON mid-stream. Concatenate the chunks for a given
 * `toolUseId` and only attempt parsing after the matching `tool-use` event
 * arrives, or render the raw text as a live preview.
 */
export interface ToolArgsDelta {
  kind: 'tool-args-delta'
  toolUseId: string
  toolName: string
  partialJson: string
}

export interface UsageDelta {
  kind: 'usage'
  usage: UsageTotals
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error'

export interface FinishDelta {
  kind: 'finish'
  stopReason: StopReason
}

export type ProviderStreamEvent =
  | TextDelta
  | ThinkingDelta
  | ThinkingSignature
  | ToolUseDelta
  | ToolArgsDelta
  | UsageDelta
  | FinishDelta

export interface Provider {
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}
