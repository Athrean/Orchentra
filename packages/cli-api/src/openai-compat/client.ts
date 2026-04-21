import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  StopReason,
  ChatMessage,
  ProviderToolSchema,
} from '@orchentra/cli-core'
import { emptyUsage } from '@orchentra/cli-core'
import type { OpenAiMessage, OpenAiToolCall, OpenAiToolDefinition, OpenAiStreamDelta } from './types'

export interface OpenAiCompatConfig {
  providerName: string
  apiKeyEnv: string
  baseUrlEnv: string
  defaultBaseUrl: string
}

const XAI_CONFIG: OpenAiCompatConfig = {
  providerName: 'xAI',
  apiKeyEnv: 'XAI_API_KEY',
  baseUrlEnv: 'XAI_BASE_URL',
  defaultBaseUrl: 'https://api.x.ai/v1',
}

const OPENAI_CONFIG: OpenAiCompatConfig = {
  providerName: 'OpenAI',
  apiKeyEnv: 'OPENAI_API_KEY',
  baseUrlEnv: 'OPENAI_BASE_URL',
  defaultBaseUrl: 'https://api.openai.com/v1',
}

const DASHSCOPE_CONFIG: OpenAiCompatConfig = {
  providerName: 'DashScope',
  apiKeyEnv: 'DASHSCOPE_API_KEY',
  baseUrlEnv: 'DASHSCOPE_BASE_URL',
  defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

export { XAI_CONFIG, OPENAI_CONFIG, DASHSCOPE_CONFIG }

export class OpenAiCompatProvider implements Provider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly config: OpenAiCompatConfig

  constructor(config: OpenAiCompatConfig, apiKey?: string, baseUrl?: string) {
    this.config = config
    this.apiKey = apiKey ?? process.env[config.apiKeyEnv] ?? ''
    this.baseUrl = (baseUrl ?? process.env[config.baseUrlEnv] ?? config.defaultBaseUrl).replace(/\/$/, '')
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const url = `${this.baseUrl}/chat/completions`
    const body = buildRequestBody(request)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(`${this.config.providerName} API error: ${response.status} ${text}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          for (const tc of Array.from(pendingToolCalls.values())) {
            yield {
              kind: 'tool-use',
              call: { id: tc.id, name: tc.name, input: safeParseJson(tc.args) },
            }
          }
          yield { kind: 'usage', usage: emptyUsage() }
          yield { kind: 'finish', stopReason: mapFinishReason(pendingToolCalls.size > 0) }
          return
        }

        const chunk = safeParseJson(data) as OpenAiStreamDelta | null
        if (!chunk?.choices?.length) continue

        const choice = chunk.choices[0]
        const delta = choice.delta

        if (delta?.content) {
          yield { kind: 'text-delta', delta: delta.content }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = pendingToolCalls.get(tc.index)
            if (!existing && tc.id) {
              pendingToolCalls.set(tc.index, {
                id: tc.id,
                name: tc.function?.name ?? '',
                args: tc.function?.arguments ?? '',
              })
            } else if (existing) {
              if (tc.function?.name) existing.name += tc.function.name
              if (tc.function?.arguments) existing.args += tc.function.arguments
            }
          }
        }

        if (chunk.usage) {
          yield {
            kind: 'usage',
            usage: {
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              cacheReadTokens: 0,
              cacheCreationTokens: 0,
            },
          }
        }
      }
    }
  }
}

function buildRequestBody(request: ProviderRequest): Record<string, unknown> {
  const messages: OpenAiMessage[] = []

  if (request.systemStatic || request.systemDynamic) {
    const parts: string[] = []
    if (request.systemStatic) parts.push(request.systemStatic)
    if (request.systemDynamic) parts.push(request.systemDynamic)
    messages.push({ role: 'system', content: parts.join('\n\n') })
  }

  for (const msg of request.messages) {
    messages.push(convertMessage(msg))
  }

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    stream: true,
  }

  if (request.maxOutputTokens) {
    body.max_tokens = request.maxOutputTokens
  }

  if (request.tools.length > 0) {
    body.tools = request.tools.map(convertTool)
  }

  return body
}

export function convertMessage(msg: ChatMessage): OpenAiMessage {
  if (msg.role === 'user') {
    return { role: 'user', content: msg.content }
  }
  if (msg.role === 'assistant') {
    const result: OpenAiMessage = { role: 'assistant', content: msg.content || null }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      result.tool_calls = msg.toolCalls.map(
        (tc): OpenAiToolCall => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input) },
        }),
      )
    }
    return result
  }
  if (msg.role === 'tool') {
    return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId }
  }
  return { role: 'user', content: msg.content }
}

export function convertTool(tool: ProviderToolSchema): OpenAiToolDefinition {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }
}

function mapFinishReason(hasToolCalls: boolean): StopReason {
  if (hasToolCalls) return 'tool_use'
  return 'end_turn'
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
