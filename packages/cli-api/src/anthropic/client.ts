import type { Provider, ProviderRequest, ProviderStreamEvent, StopReason } from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { classifyError, enrichAuthError, missingCredentialsError, type AnthropicApiError } from '../errors'
import { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from '../retry'
import { injectCacheBoundary } from './cache'
import type { MessageRequest, StreamEvent, Usage } from './types'
import { getCredential } from '../credential-store'

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
// Only public betas we actually use. The `claude-code-*` beta is Anthropic-internal
// and sending it from a non-Claude-Code client risks account flags / throttling.
const ANTHROPIC_BETA = 'prompt-caching-scope-2026-01-05'
const DEFAULT_MODEL = 'claude-sonnet-4-6'

export class AnthropicProvider implements Provider {
  private readonly baseUrl: string
  private readonly model: string
  private readonly maxTokens: number
  private readonly authHeaders: AuthHeaders
  private readonly retryConfig: RetryConfig

  constructor(config: AnthropicConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')
    this.model = config.model ?? DEFAULT_MODEL
    this.maxTokens = config.maxTokens ?? 64000
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retries }

    const stored = getCredential('anthropic')
    const apiKey = config.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? stored?.apiKey
    const authToken = config.authToken ?? process.env['ANTHROPIC_AUTH_TOKEN'] ?? stored?.accessToken

    if (apiKey && authToken) {
      this.authHeaders = {
        'x-api-key': apiKey,
        Authorization: `Bearer ${authToken}`,
        authSource: 'both',
      }
    } else if (apiKey) {
      this.authHeaders = { 'x-api-key': apiKey, authSource: 'api_key' }
    } else if (authToken) {
      this.authHeaders = { Authorization: `Bearer ${authToken}`, authSource: 'bearer' }
    } else {
      this.authHeaders = { authSource: 'api_key' }
    }
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    if (!this.authHeaders['x-api-key'] && !this.authHeaders.Authorization) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw missingCredentialsError()
    }

    const system = injectCacheBoundary(request.systemStatic, request.systemDynamic)
    const body: MessageRequest = {
      model: request.model || this.model,
      max_tokens: request.maxOutputTokens || this.maxTokens,
      messages: request.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
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

    const url = `${this.baseUrl}/v1/messages`
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': ANTHROPIC_BETA,
      'user-agent': 'OrchentraCLI/1.0',
      ...(this.authHeaders['x-api-key'] ? { 'x-api-key': this.authHeaders['x-api-key'] } : {}),
      ...(this.authHeaders.Authorization ? { Authorization: this.authHeaders.Authorization } : {}),
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
        const networkError: AnthropicApiError = {
          status: 0,
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
          failureClass: 'provider_transport',
        }
        lastError = networkError
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
        const rawToken = this.authHeaders['x-api-key'] ?? this.authHeaders.Authorization?.replace('Bearer ', '')
        lastError = enrichAuthError({ ...apiError, requestId }, this.authHeaders.authSource, rawToken)

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
      throw Object.assign(lastError, {
        failureClass: 'provider_retry_exhausted' as const,
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
                let parsedInput: unknown
                try {
                  parsedInput = JSON.parse(pending.input || '{}')
                } catch {
                  parsedInput = {}
                }
                yield {
                  kind: 'tool-use',
                  call: { id: pending.id, name: pending.name, input: parsedInput },
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
