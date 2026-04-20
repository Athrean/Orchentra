export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface OutputContentBlock {
  type: 'text' | 'tool_use' | 'thinking' | 'redacted_thinking'
  text?: string
  id?: string
  name?: string
  input?: unknown
  thinking?: string
  signature?: string
  data?: unknown
}

export interface ContentBlockDelta {
  type: 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta'
  text?: string
  partial_json?: string
  thinking?: string
  signature?: string
}

export type StreamEvent =
  | { type: 'message_start'; message: { usage: Usage; content?: OutputContentBlock[] } }
  | { type: 'content_block_start'; index: number; content_block: OutputContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string }; usage: Usage }
  | { type: 'message_stop' }

export interface MessageRequest {
  model: string
  max_tokens: number
  messages: { role: 'user' | 'assistant'; content: string | ContentBlock[] }[]
  system?: string | SystemContentBlock[]
  tools?: ToolDefinition[]
  stream?: boolean
  temperature?: number
  stop_sequences?: string[]
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
}

export interface SystemContentBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}
