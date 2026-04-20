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
}

export interface TextDelta {
  kind: 'text-delta'
  delta: string
}

export interface ToolUseDelta {
  kind: 'tool-use'
  call: ToolCall
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

export type ProviderStreamEvent = TextDelta | ToolUseDelta | UsageDelta | FinishDelta

export interface Provider {
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}
