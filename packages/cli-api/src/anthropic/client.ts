import type { ChatMessage, Provider, ProviderRequest, ProviderStreamEvent, StopReason } from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { AnthropicApiError, classifyError, enrichAuthError, missingCredentialsError } from '../errors'
import { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from '../retry'
import { injectCacheBoundary } from './cache'
import type { ContentBlock, MessageRequest, StreamEvent, Usage } from './types'
import { resolveAnthropicAuthToken } from './oauth'
import { parseToolArguments } from '../tool-arguments'

export interface AnthropicConfig {
  apiKey?: string
  authToken?: string
  baseUrl?: string
  model?: string
  maxTokens?: number
  retries?: Partial<RetryConfig>
}

interface AuthHeaders {
  'x-api-key'?: string
  Authorization?: string
  authSource: 'api_key' | 'bearer' | 'both'
}

const ANTHROPIC_VERSION = '2023-06-01'
// Public-only beta set used when authenticating with a console.anthropic.com
// API key. Safe for any client.
const ANTHROPIC_BETA_API_KEY = 'prompt-caching-scope-2026-01-05'
// Subscription OAuth bearer tokens (claude.ai accounts) require the OAuth +
// Claude-Code agentic beta set AND the Claude Code user-agent. Without
// `oauth-2025-04-20` Anthropic returns "OAuth authentication is currently
// not supported". interleaved-thinking + fine-grained-tool-streaming unlock
// Claude 4+ tool flows. Set mirrors claude-code / opencode / codebuff.
const ANTHROPIC_BETA_OAUTH =
  'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14'
const ANTHROPIC_OAUTH_USER_AGENT = 'claude-cli/1.0.0 (external, cli)'
const DEFAULT_USER_AGENT = 'OrchentraCLI/1.0'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

export class AnthropicProvider implements Provider {
  private readonly baseUrl: string
  private readonly model: string
  private readonly maxTokens: number
  private readonly retryConfig: RetryConfig
  private readonly explicitApiKey: string | undefined
  private readonly explicitAuthToken: string | undefined

  constructor(config: AnthropicConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')
    this.model = config.model ?? DEFAULT_MODEL
    this.maxTokens = config.maxTokens ?? 64000
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retries }
    this.explicitApiKey = config.apiKey
    this.explicitAuthToken = config.authToken
  }

  // Resolve credentials at request time so a stored OAuth token that has
  // expired since the CLI was launched gets refreshed before the next
  // request goes out — otherwise the API replies "OAuth authentication
  // is currently not supported" and the user sees a flashing red error.
  private async resolveAuthHeaders(): Promise<AuthHeaders> {
    const apiKey = this.explicitApiKey ?? process.env['ANTHROPIC_API_KEY']
    let authToken = this.explicitAuthToken ?? process.env['ANTHROPIC_AUTH_TOKEN']

    if (!apiKey && !authToken) {
      const refreshed = await resolveAnthropicAuthToken()
      if (refreshed) authToken = refreshed
    }

    if (apiKey && authToken) {
      return {
        'x-api-key': apiKey,
        Authorization: `Bearer ${authToken}`,
        authSource: 'both',
      }
    }
    if (apiKey) return { 'x-api-key': apiKey, authSource: 'api_key' }
    if (authToken) return { Authorization: `Bearer ${authToken}`, authSource: 'bearer' }
    return { authSource: 'api_key' }
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const authHeaders = await this.resolveAuthHeaders()
    if (!authHeaders['x-api-key'] && !authHeaders.Authorization) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw missingCredentialsError()
    }

    const usingOAuth = authHeaders.authSource === 'bearer' || authHeaders.authSource === 'both'
    const system = injectCacheBoundary(request.systemStatic, request.systemDynamic, { usingOAuth })
    const body: MessageRequest = {
      model: request.model || this.model,
      max_tokens: request.maxOutputTokens || this.maxTokens,
      messages: toAnthropicMessages(request.messages),
      system,
      stream: true,
    }

    if (request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }))
    }

    // Subscription OAuth tokens require the agentic beta + Claude-Code UA;
    // without these the API replies "OAuth authentication is currently not
    // supported." API-key requests use the public beta set and our own UA.
    const url = `${this.baseUrl}/v1/messages`
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': usingOAuth ? ANTHROPIC_BETA_OAUTH : ANTHROPIC_BETA_API_KEY,
      'user-agent': usingOAuth ? ANTHROPIC_OAUTH_USER_AGENT : DEFAULT_USER_AGENT,
      // Required when sending a Pro/Max OAuth bearer from a non-Claude-Code
      // binary; matches what the official CLI sends. Omit on api-key calls.
      ...(usingOAuth ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
      ...(authHeaders['x-api-key'] ? { 'x-api-key': authHeaders['x-api-key'] } : {}),
      ...(authHeaders.Authorization ? { Authorization: authHeaders.Authorization } : {}),
    }

    let lastError: AnthropicApiError | null = null

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = computeBackoff(attempt, this.retryConfig)
        await sleep(delay)
      }

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      } catch (err) {
        lastError = new AnthropicApiError({
          status: 0,
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
          failureClass: 'provider_transport',
        })
        continue
      }

      if (!response.ok) {
        const responseBody = await response.text()
        let errorType: string | undefined
        try {
          errorType = JSON.parse(responseBody)?.error?.type
        } catch {
          /* use default classification */
        }

        const apiError = classifyError(response.status, responseBody, errorType)
        const requestId = response.headers.get('request-id') ?? undefined
        const rawToken = authHeaders['x-api-key'] ?? authHeaders.Authorization?.replace('Bearer ', '')
        const withRequestId = new AnthropicApiError({
          status: apiError.status,
          errorType: apiError.errorType,
          message: apiError.message,
          retryable: apiError.retryable,
          failureClass: apiError.failureClass,
          requestId,
        })
        lastError = enrichAuthError(withRequestId, authHeaders.authSource, rawToken)

        if (!apiError.retryable) {
          throw lastError
        }
        continue
      }

      if (!response.body) {
        throw new Error('Response body is null — streaming not supported')
      }

      yield* this.consumeStream(response.body)
      return
    }

    if (lastError) {
      throw new AnthropicApiError({
        status: lastError.status,
        errorType: lastError.errorType,
        requestId: lastError.requestId,
        retryable: false,
        failureClass: 'provider_retry_exhausted',
        message: `Retries exhausted after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`,
      })
    }
  }

  private async *consumeStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderStreamEvent> {
    const parser = new SseParser()
    const decoder = new TextDecoder()
    const pendingTools = new Map<number, { id: string; name: string; input: string }>()
    let lastUsage: Usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    let stopReason: StopReason = 'end_turn'

    const reader = body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        const frames = parser.push(text)

        for (const frame of frames) {
          let event: StreamEvent
          try {
            event = JSON.parse(frame.data) as StreamEvent
          } catch {
            continue
          }

          switch (event.type) {
            case 'message_start': {
              if (event.message?.usage) {
                lastUsage = mergeUsage(lastUsage, event.message.usage)
              }
              break
            }

            case 'content_block_start': {
              const block = event.content_block
              if (block?.type === 'tool_use') {
                pendingTools.set(event.index, {
                  id: block.id ?? '',
                  name: block.name ?? '',
                  input: '',
                })
              }
              break
            }

            case 'content_block_delta': {
              const delta = event.delta
              if (delta.type === 'text_delta' && delta.text) {
                yield { kind: 'text-delta', delta: delta.text }
              } else if (delta.type === 'thinking_delta' && delta.thinking) {
                yield { kind: 'thinking-delta', delta: delta.thinking }
              } else if (delta.type === 'signature_delta' && delta.signature) {
                yield { kind: 'thinking-signature', signature: delta.signature }
              } else if (delta.type === 'input_json_delta' && delta.partial_json != null) {
                const pending = pendingTools.get(event.index)
                if (pending) {
                  pending.input += delta.partial_json
                }
              }
              break
            }

            case 'content_block_stop': {
              const pending = pendingTools.get(event.index)
              if (pending) {
                const { args } = parseToolArguments(pending.input, pending.name)
                yield {
                  kind: 'tool-use',
                  call: { id: pending.id, name: pending.name, input: args },
                }
                pendingTools.delete(event.index)
              }
              break
            }

            case 'message_delta': {
              if (event.usage) {
                lastUsage = mergeUsage(lastUsage, event.usage)
              }
              if (event.delta?.stop_reason) {
                stopReason = mapStopReason(event.delta.stop_reason)
              }
              break
            }

            case 'message_stop': {
              yield {
                kind: 'usage',
                usage: {
                  inputTokens: lastUsage.input_tokens,
                  outputTokens: lastUsage.output_tokens,
                  cacheReadTokens: lastUsage.cache_read_input_tokens,
                  cacheCreationTokens: lastUsage.cache_creation_input_tokens,
                },
              }
              yield { kind: 'finish', stopReason }
              return
            }
          }
        }
      }

      // Stream ended without message_stop — flush remaining parser state
      const trailingFrames = parser.finish()
      for (const frame of trailingFrames) {
        try {
          const event = JSON.parse(frame.data) as StreamEvent
          if (event.type === 'message_delta' && event.usage) {
            lastUsage = mergeUsage(lastUsage, event.usage)
          }
        } catch {
          /* ignore unparseable trailing data */
        }
      }

      yield {
        kind: 'usage',
        usage: {
          inputTokens: lastUsage.input_tokens,
          outputTokens: lastUsage.output_tokens,
          cacheReadTokens: lastUsage.cache_read_input_tokens,
          cacheCreationTokens: lastUsage.cache_creation_input_tokens,
        },
      }
      yield { kind: 'finish', stopReason }
    } finally {
      reader.releaseLock()
    }
  }
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'end_turn':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    default:
      return 'error'
  }
}

function mergeUsage(existing: Usage, incoming: Usage): Usage {
  return {
    input_tokens: incoming.input_tokens ?? existing.input_tokens,
    output_tokens: (existing.output_tokens ?? 0) + (incoming.output_tokens ?? 0),
    cache_creation_input_tokens: incoming.cache_creation_input_tokens ?? existing.cache_creation_input_tokens,
    cache_read_input_tokens: incoming.cache_read_input_tokens ?? existing.cache_read_input_tokens,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Anthropic only accepts roles "user" and "assistant". Tool results live as
// `tool_result` content blocks inside a `user` message, and assistant tool
// calls live as `tool_use` blocks inside an `assistant` message. The
// canonical ChatMessage uses role "tool" for results and a parallel
// `toolCalls` array on the assistant message; this converter rewrites that
// shape into the wire format Anthropic expects.
//
// Consecutive role-"tool" messages from a single multi-tool turn are
// coalesced into ONE user message with multiple `tool_result` blocks —
// Anthropic 400s on tool_result blocks split across messages.
export function toAnthropicMessages(messages: readonly ChatMessage[]): MessageRequest['messages'] {
  const out: MessageRequest['messages'] = []

  for (const m of messages) {
    if (m.role === 'tool') {
      const block: ContentBlock = {
        type: 'tool_result',
        tool_use_id: m.toolCallId ?? '',
        content: m.content,
      }
      const last = out[out.length - 1]
      if (
        last &&
        last.role === 'user' &&
        Array.isArray(last.content) &&
        last.content.every((b) => b.type === 'tool_result')
      ) {
        last.content.push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: ContentBlock[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const call of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
      }
      out.push({ role: 'assistant', content: blocks })
      continue
    }

    out.push({ role: m.role, content: m.content })
  }

  return out
}
