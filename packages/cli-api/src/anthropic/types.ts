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
  | { type: 'message_start'; message: { usage: Usage; content?: OutputContentBlock[]; model?: string } }
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
  thinking?: { type: 'adaptive' }
  output_config?: { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }
  stream?: boolean
  temperature?: number
  stop_sequences?: string[]
}

export interface ImageSource {
  type: 'base64'
  media_type: string
  data: string
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image'
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  // tool_result content is a string when text-only, or an array of blocks
  // (text + image) when the result carries visual output.
  content?: string | ContentBlock[]
  thinking?: string
  signature?: string
  // Present when type === 'image'.
  source?: ImageSource
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
  cache_control?: { type: 'ephemeral' }
}
