import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  StopReason,
  ChatMessage,
  ProviderToolSchema,
} from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from '../retry'
import type { GeminiContent, GeminiFunctionDeclaration, GeminiPart, GeminiRequest, GeminiStreamChunk } from './types'
import { getCredential } from '../credential-store'

export interface GeminiConfig {
  apiKey?: string
  oauthToken?: string
  baseUrl?: string
  model?: string
  maxTokens?: number
  retries?: Partial<RetryConfig>
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash'

export class GeminiProvider implements Provider {
  private readonly apiKey: string
  private readonly oauthToken: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly maxTokens: number
  private readonly retryConfig: RetryConfig

  constructor(config: GeminiConfig = {}) {
    const stored = getCredential('gemini')
    this.apiKey =
      config.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? stored?.apiKey ?? ''
    this.oauthToken = config.oauthToken ?? process.env['GEMINI_OAUTH_TOKEN'] ?? stored?.accessToken ?? ''
    this.baseUrl = (config.baseUrl ?? process.env['GEMINI_BASE_URL'] ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.model = config.model ?? DEFAULT_MODEL
    this.maxTokens = config.maxTokens ?? 8192
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retries }
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    if (!this.apiKey && !this.oauthToken) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error('Gemini credentials missing: set GEMINI_API_KEY, GOOGLE_API_KEY, or GEMINI_OAUTH_TOKEN')
    }

    const model = request.model || this.model
    const body = buildGeminiRequest(request, this.maxTokens)

    const url = this.oauthToken
      ? `${this.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
      : `${this.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'OrchentraCLI/1.0',
    }
    if (this.oauthToken) {
      headers['Authorization'] = `Bearer ${this.oauthToken}`
    }

    let lastErr: Error | null = null

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) await sleep(computeBackoff(attempt, this.retryConfig))

      let response: Response
      try {
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        continue
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        lastErr = new Error(`Gemini API error ${response.status}: ${text.slice(0, 400)}`)
        if (response.status < 500 && response.status !== 429) {
          throw lastErr
        }
        continue
      }

      if (!response.body) {
        throw new Error('Gemini response body is null')
      }

      yield* this.consumeStream(response.body)
      return
    }

    if (lastErr) throw lastErr
  }

  private async *consumeStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderStreamEvent> {
    const parser = new SseParser()
    const decoder = new TextDecoder()
    const reader = body.getReader()
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let stopReason: StopReason = 'end_turn'
    let toolCounter = 0
    let sawToolCall = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        const frames = parser.push(text)

        for (const frame of frames) {
          let chunk: GeminiStreamChunk
          try {
            chunk = JSON.parse(frame.data) as GeminiStreamChunk
          } catch {
            continue
          }

          if (chunk.promptFeedback?.blockReason) {
            stopReason = 'error'
          }

          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
            outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
            cacheReadTokens = chunk.usageMetadata.cachedContentTokenCount ?? cacheReadTokens
          }

          const candidate = chunk.candidates?.[0]
          if (!candidate) continue

          for (const part of candidate.content?.parts ?? []) {
            if (typeof part.text === 'string' && part.text.length > 0) {
              yield { kind: 'text-delta', delta: part.text }
            }
            if (part.functionCall) {
              sawToolCall = true
              toolCounter += 1
              yield {
                kind: 'tool-use',
                call: {
                  id: `gemini-tool-${Date.now().toString(36)}-${toolCounter}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args ?? {},
                },
              }
            }
          }

          if (candidate.finishReason) {
            stopReason = mapFinishReason(candidate.finishReason, sawToolCall)
          }
        }
      }

      yield {
        kind: 'usage',
        usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: 0 },
      }
      yield { kind: 'finish', stopReason }
    } finally {
      reader.releaseLock()
    }
  }
}

function buildGeminiRequest(request: ProviderRequest, defaultMaxTokens: number): GeminiRequest {
  const body: GeminiRequest = {
    contents: convertMessages(request.messages),
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens || defaultMaxTokens,
    },
  }

  const systemParts: GeminiPart[] = []
  if (request.systemStatic) systemParts.push({ text: request.systemStatic })
  if (request.systemDynamic) systemParts.push({ text: request.systemDynamic })
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts }
  }

  if (request.tools.length > 0) {
    body.tools = [{ functionDeclarations: request.tools.map(convertTool) }]
  }

  return body
}

function convertMessages(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', parts: [{ text: msg.content }] })
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (msg.content) parts.push({ text: msg.content })
      for (const call of msg.toolCalls ?? []) {
        parts.push({
          functionCall: {
            name: call.name,
            args: typeof call.input === 'object' && call.input !== null ? (call.input as Record<string, unknown>) : {},
          },
        })
      }
      if (parts.length > 0) result.push({ role: 'model', parts })
    } else if (msg.role === 'tool') {
      result.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.toolCallId ?? 'tool',
              response: { content: msg.content },
            },
          },
        ],
      })
    }
  }
  return result
}

function convertTool(tool: ProviderToolSchema): GeminiFunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchema(tool.inputSchema),
  }
}

function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  // Gemini rejects $schema, additionalProperties, and some JSONSchema dialects.
  // Strip unsupported keys recursively.
  const forbidden = new Set(['$schema', '$id', '$ref', 'additionalProperties', 'definitions', '$defs'])
  const copy: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (forbidden.has(key)) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      copy[key] = sanitizeSchema(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      copy[key] = value.map((v) => (v && typeof v === 'object' ? sanitizeSchema(v as Record<string, unknown>) : v))
    } else {
      copy[key] = value
    }
  }
  return copy
}

function mapFinishReason(reason: string, sawToolCall: boolean): StopReason {
  if (sawToolCall) return 'tool_use'
  switch (reason) {
    case 'STOP':
      return 'end_turn'
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'SAFETY':
    case 'RECITATION':
    case 'OTHER':
      return 'error'
    default:
      return 'end_turn'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
