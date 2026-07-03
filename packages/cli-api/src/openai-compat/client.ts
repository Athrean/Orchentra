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
import { getCredential, type ProviderKey } from '../credential-store'
import { parseToolArguments } from '../tool-arguments'

export interface OpenAiCompatConfig {
  providerName: string
  apiKeyEnv: string
  baseUrlEnv: string
  defaultBaseUrl: string
  credentialKey?: ProviderKey
  /**
   * Routing prefix stripped from the wire model before it hits the server.
   * Lets `ollama/llama3` route to the local preset while the server sees the
   * bare `llama3` it actually knows.
   */
  modelPrefix?: string
}

const XAI_CONFIG: OpenAiCompatConfig = {
  providerName: 'xAI',
  apiKeyEnv: 'XAI_API_KEY',
  baseUrlEnv: 'XAI_BASE_URL',
  defaultBaseUrl: 'https://api.x.ai/v1',
  credentialKey: 'xai',
}

const OPENAI_CONFIG: OpenAiCompatConfig = {
  providerName: 'OpenAI',
  apiKeyEnv: 'OPENAI_API_KEY',
  baseUrlEnv: 'OPENAI_BASE_URL',
  defaultBaseUrl: 'https://api.openai.com/v1',
  credentialKey: 'openai',
}

const DASHSCOPE_CONFIG: OpenAiCompatConfig = {
  providerName: 'DashScope',
  apiKeyEnv: 'DASHSCOPE_API_KEY',
  baseUrlEnv: 'DASHSCOPE_BASE_URL',
  defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  credentialKey: 'dashscope',
}

// Ollama's OpenAI-compatible endpoint (also fits LM Studio / llama.cpp / vLLM
// via the OLLAMA_BASE_URL override). Local inference needs no API key; the
// empty Bearer is ignored by these servers.
const LOCAL_CONFIG: OpenAiCompatConfig = {
  providerName: 'Local',
  apiKeyEnv: 'OLLAMA_API_KEY',
  baseUrlEnv: 'OLLAMA_BASE_URL',
  defaultBaseUrl: 'http://localhost:11434/v1',
  modelPrefix: 'ollama/',
}

export { XAI_CONFIG, OPENAI_CONFIG, DASHSCOPE_CONFIG, LOCAL_CONFIG }

export class OpenAiCompatProvider implements Provider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly config: OpenAiCompatConfig

  constructor(config: OpenAiCompatConfig, apiKey?: string, baseUrl?: string) {
    this.config = config
    const stored = config.credentialKey ? getCredential(config.credentialKey) : null
    this.apiKey = apiKey ?? process.env[config.apiKeyEnv] ?? stored?.apiKey ?? ''
    this.baseUrl = (baseUrl ?? process.env[config.baseUrlEnv] ?? config.defaultBaseUrl).replace(/\/$/, '')
  }

  private stripModelPrefix(model: string): string {
    const prefix = this.config.modelPrefix
    return prefix && model.startsWith(prefix) ? model.slice(prefix.length) : model
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const url = `${this.baseUrl}/chat/completions`
    const wireModel = this.stripModelPrefix(request.model)
    const body = buildRequestBody({ ...request, model: wireModel }, supportsReasoningEffort(this.config, wireModel))

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
            const { args } = parseToolArguments(tc.args, tc.name)
            yield {
              kind: 'tool-use',
              call: { id: tc.id, name: tc.name, input: args },
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

function buildRequestBody(request: ProviderRequest, includeReasoningEffort = false): Record<string, unknown> {
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

  if (includeReasoningEffort && request.effort) {
    // OpenAI's reasoning_effort only accepts low|medium|high; the higher
    // Orchentra tiers clamp down to 'high' on the wire.
    body.reasoning_effort = request.effort === 'xhigh' || request.effort === 'max' ? 'high' : request.effort
  }

  if (request.tools.length > 0) {
    body.tools = request.tools.map(convertTool)
  }

  return body
}

function supportsReasoningEffort(config: OpenAiCompatConfig, model: string): boolean {
  if (config.providerName !== 'OpenAI') return false
  const lower = model.toLowerCase()
  return (
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('gpt-5') ||
    lower.includes('reasoning')
  )
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
