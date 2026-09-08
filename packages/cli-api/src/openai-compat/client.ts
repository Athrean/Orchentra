import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  StopReason,
  ChatMessage,
  ImageContent,
  ProviderToolSchema,
} from '@orchentra/cli-core'
import { assertVisionSupport, emptyUsage } from '@orchentra/cli-core'
import type { OpenAiContentPart, OpenAiMessage, OpenAiToolCall, OpenAiToolDefinition, OpenAiStreamDelta } from './types'
import { getCredential, type ProviderKey } from '../credential-store'
import { parseToolArguments } from '../tool-arguments'
import { assertModelProvenance } from '../model-provenance'
import { newSessionId } from '../session-id'
import { isRetryableStatus } from '../errors'
import { fetchWithRetry, resolveRetryConfig, type RetryConfig } from '../retry'

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
  /**
   * Whether to require the server to echo the requested model id. Defaults to
   * off when a `modelPrefix` is set (local servers rewrite tags), but a hosted
   * gateway that routes by prefix still echoes ids verbatim and keeps the check.
   */
  enforceProvenance?: boolean
  /**
   * Header carrying a per-conversation routing id. The Zen gateway rejects a
   * request without one ("Request is missing x-opencode-session and cannot be
   * routed efficiently"), and the id is what gives a conversation cache
   * affinity, so it is generated once per provider instance, not per request.
   */
  sessionHeader?: string
  /** Retry budget override; env and defaults fill in what is not set here. */
  retries?: Partial<RetryConfig>
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

const OPENROUTER_CONFIG: OpenAiCompatConfig = {
  providerName: 'OpenRouter',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  baseUrlEnv: 'OPENROUTER_BASE_URL',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  credentialKey: 'openrouter',
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

// opencode's Zen gateway: one OpenAI-compatible endpoint fronting many
// families, including free/contributor tiers. Routed by an explicit `zen/`
// prefix so a bare model id never silently lands on someone else's credits.
const ZEN_CONFIG: OpenAiCompatConfig = {
  providerName: 'Zen',
  apiKeyEnv: 'ZEN_API_KEY',
  baseUrlEnv: 'ZEN_BASE_URL',
  defaultBaseUrl: 'https://opencode.ai/zen/v1',
  modelPrefix: 'zen/',
  enforceProvenance: true,
  sessionHeader: 'x-opencode-session',
  credentialKey: 'zen',
}

// opencode Go: the flat monthly plan. Same key as Zen, different host —
// `/zen/go/v1` bills against the plan while `/zen/v1` bills prepaid credits,
// so a Go subscriber hitting the Zen host gets `401 CreditsError` on a plan
// they already pay for. Routed by an explicit `go/` prefix.
const ZEN_GO_CONFIG: OpenAiCompatConfig = {
  providerName: 'opencode Go',
  apiKeyEnv: 'ZEN_API_KEY',
  baseUrlEnv: 'ZEN_GO_BASE_URL',
  defaultBaseUrl: 'https://opencode.ai/zen/go/v1',
  modelPrefix: 'go/',
  enforceProvenance: true,
  sessionHeader: 'x-opencode-session',
  credentialKey: 'zen',
}

export { XAI_CONFIG, OPENAI_CONFIG, OPENROUTER_CONFIG, DASHSCOPE_CONFIG, LOCAL_CONFIG, ZEN_CONFIG, ZEN_GO_CONFIG }

/** Same host and key, reached at `/responses` for the families served there. */
export const ZEN_GO_RESPONSES_CONFIG = {
  providerName: 'opencode Go',
  apiKeyEnv: 'ZEN_API_KEY',
  baseUrlEnv: 'ZEN_GO_BASE_URL',
  defaultBaseUrl: 'https://opencode.ai/zen/go/v1',
  modelPrefix: 'go/',
  sessionHeader: 'x-opencode-session',
  credentialKey: 'zen' as const,
}

/** Same gateway and key, reached at `/responses` for the families served there. */
export const ZEN_RESPONSES_CONFIG = {
  providerName: 'Zen',
  apiKeyEnv: 'ZEN_API_KEY',
  baseUrlEnv: 'ZEN_BASE_URL',
  defaultBaseUrl: 'https://opencode.ai/zen/v1',
  modelPrefix: 'zen/',
  sessionHeader: 'x-opencode-session',
  credentialKey: 'zen' as const,
}

export class OpenAiCompatProvider implements Provider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly config: OpenAiCompatConfig
  private readonly sessionId = newSessionId()

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
    // Local inference servers (Ollama/LM Studio) rewrite model tags (e.g.
    // `llama3` → `llama3:latest`), so exact-match provenance would false-positive
    // there — enforce the `sent === returned` check only for hosted providers,
    // which echo the requested model id verbatim. Local stays request-side
    // verified only (no fake certainty).
    const enforceProvenance = this.config.enforceProvenance ?? !this.config.modelPrefix
    const body = buildRequestBody(
      { ...request, model: wireModel },
      supportsReasoningEffort(this.config, wireModel),
      this.config.providerName === 'OpenAI',
    )

    const response = await fetchWithRetry(
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.config.sessionHeader ? { [this.config.sessionHeader]: this.sessionId } : {}),
          },
          body: JSON.stringify(body),
          signal: request.signal,
        }),
      isRetryableStatus,
      { config: resolveRetryConfig(this.config.retries), ...(request.signal ? { signal: request.signal } : {}) },
    )

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
    let providerVerified = false
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
        // Usage-only terminal chunks can report provenance too. Validate
        // before emitting either content or model-attributed accounting.
        if (enforceProvenance && !providerVerified && chunk?.model) {
          assertModelProvenance(wireModel, chunk.model, this.config.providerName)
          providerVerified = true
        }
        if (chunk?.usage) {
          const cacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
          yield {
            kind: 'usage',
            cacheReadReported: chunk.usage.prompt_tokens_details?.cached_tokens !== undefined,
            usage: {
              // OpenAI reports cached input as a subset of prompt_tokens;
              // Orchentra stores disjoint categories to avoid double billing.
              inputTokens: Math.max(0, (chunk.usage.prompt_tokens ?? 0) - cacheReadTokens),
              outputTokens: chunk.usage.completion_tokens ?? 0,
              cacheReadTokens,
              cacheCreationTokens: 0,
            },
          }
        }
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
      }
    }
  }
}

function buildRequestBody(
  request: ProviderRequest,
  includeReasoningEffort = false,
  includeUsage = false,
): Record<string, unknown> {
  assertVisionSupport(request.messages, request.model)
  const messages: OpenAiMessage[] = []

  if (request.systemStatic || request.systemDynamic) {
    const parts: string[] = []
    if (request.systemStatic) parts.push(request.systemStatic)
    if (request.systemDynamic) parts.push(request.systemDynamic)
    messages.push({ role: 'system', content: parts.join('\n\n') })
  }

  messages.push(...convertMessages(request.messages))

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    stream: true,
  }

  if (includeUsage) body.stream_options = { include_usage: true }

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
  const lower = model.toLowerCase()
  if (config.providerName === 'OpenRouter') {
    return lower.startsWith('openai/gpt-oss') || lower.startsWith('openai/gpt-5') || lower.includes('reasoning')
  }
  if (config.providerName !== 'OpenAI') return false
  return (
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4') ||
    lower.startsWith('gpt-5') ||
    lower.includes('reasoning')
  )
}

function imageUrlPart(image: ImageContent): OpenAiContentPart {
  return { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }
}

/**
 * Converts the message list to OpenAI wire messages, expanding any image
 * payloads. OpenAI `tool` messages are string-only, so a tool result's image
 * cannot ride the tool message — it follows as a `user` message with
 * image_url parts. User-message images are inlined as array content.
 */
export function convertMessages(messages: readonly ChatMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = []
  for (const msg of messages) {
    out.push(convertMessage(msg))
    const images = msg.images ?? []
    if (msg.role === 'tool' && images.length > 0) {
      out.push({ role: 'user', content: images.map(imageUrlPart) })
    }
  }
  return out
}

export function convertMessage(msg: ChatMessage): OpenAiMessage {
  if (msg.role === 'user') {
    const images = msg.images ?? []
    if (images.length > 0) {
      return { role: 'user', content: [{ type: 'text', text: msg.content }, ...images.map(imageUrlPart)] }
    }
    return { role: 'user', content: msg.content }
  }
  if (msg.role === 'assistant') {
    const result: OpenAiMessage = { role: 'assistant', content: msg.content || null }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      result.tool_calls = msg.toolCalls.map((tc): OpenAiToolCall => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input) },
      }))
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
