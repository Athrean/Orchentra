export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
}

export interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenAiToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface OpenAiStreamDelta {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: { index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
