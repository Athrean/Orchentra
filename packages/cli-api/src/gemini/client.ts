import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  StopReason,
  ChatMessage,
  ProviderToolSchema,
  ToolCall,
} from '@orchentra/cli-core'
import { assertVisionSupport } from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { computeBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from '../retry'
import type {
  GeminiContent,
  GeminiFunctionDeclaration,
  GeminiPart,
  GeminiRequest,
  GeminiStreamChunk,
  GeminiUsageMetadata,
} from './types'
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
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: request.signal })
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        if (request.signal?.aborted) throw lastErr
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
    const usage = new GeminiUsageAccumulator()
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

          if (chunk.usageMetadata) usage.record(chunk.usageMetadata)

          const candidate = chunk.candidates?.[0]
          if (!candidate) continue

          for (const part of candidate.content?.parts ?? []) {
            if (typeof part.text === 'string' && part.text.length > 0) {
              yield { kind: 'text-delta', delta: part.text }
            }
            const call = toolCallFromPart(part, toolCounter + 1)
            if (call) {
              sawToolCall = true
              toolCounter += 1
              yield { kind: 'tool-use', call }
            }
          }

          if (candidate.finishReason) {
            stopReason = mapFinishReason(candidate.finishReason, sawToolCall)
          }
        }
      }

      yield usage.event()
      yield { kind: 'finish', stopReason }
    } finally {
      reader.releaseLock()
    }
  }
}

/**
 * Folds Gemini's `usageMetadata` into Orchentra's usage categories.
 *
 * Both Gemini transports — the API-key endpoint here and the Code Assist
 * endpoint in `code-assist.ts` — share it so their reported shape cannot drift
 * apart. It did drift once: Code Assist reported `promptTokenCount` inclusive
 * of cached tokens and never set `cacheReadReported`, so the same conversation
 * double-counted its cached prefix on one transport and not the other, and
 * every Code Assist run looked cache-unreported to `optimization.ts`.
 */
export class GeminiUsageAccumulator {
  private inputTokens = 0
  private outputTokens = 0
  private cacheReadTokens = 0
  private cacheReadReported = false

  record(meta: GeminiUsageMetadata): void {
    this.inputTokens = meta.promptTokenCount ?? this.inputTokens
    this.outputTokens = meta.candidatesTokenCount ?? this.outputTokens
    this.cacheReadTokens = meta.cachedContentTokenCount ?? this.cacheReadTokens
    this.cacheReadReported ||= meta.cachedContentTokenCount !== undefined
  }

  event(): ProviderStreamEvent {
    return {
      kind: 'usage',
      cacheReadReported: this.cacheReadReported,
      // Gemini's cachedContentTokenCount is a subset of promptTokenCount;
      // keep Orchentra's accounting categories disjoint.
      usage: {
        inputTokens: Math.max(0, this.inputTokens - this.cacheReadTokens),
        outputTokens: this.outputTokens,
        cacheReadTokens: this.cacheReadTokens,
        cacheCreationTokens: 0,
      },
    }
  }
}

export function buildGeminiRequest(request: ProviderRequest, defaultMaxTokens: number): GeminiRequest {
  assertVisionSupport(request.messages, request.model)
  const body: GeminiRequest = {
    contents: convertMessages(request.messages, request.model),
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens || defaultMaxTokens,
    },
  }

  // Effort is meant to be provider-agnostic, and Google is the only backend
  // that expresses it as a token budget rather than a named level — without
  // this the /effort dial and the model picker's ←/→ were silently inert on
  // Gemini and Antigravity while working everywhere else.
  if (request.thinkingTokenBudget && request.thinkingTokenBudget > 0) {
    body.generationConfig!.thinkingConfig = { thinkingBudget: request.thinkingTokenBudget }
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

function imageParts(msg: ChatMessage): GeminiPart[] {
  return (msg.images ?? []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } }))
}

/**
 * Sentinel Google documents for replaying a `functionCall` whose signature is
 * genuinely gone — a resumed session, a rewound history, a turn recorded
 * before this field existed. Without it any gap is an unrecoverable 400 that
 * kills the run on the next tool call; with it the turn degrades to unsigned
 * reasoning instead of dying.
 */
const SKIP_THOUGHT_SIGNATURE = 'skip_thought_signature_validator'

/** Gemini 3 rejects an unsigned replayed `functionCall`; 2.x does not sign at all. */
export function requiresThoughtSignature(model: string): boolean {
  // Substring, not anchored: ids reach here carrying Orchentra's routing
  // prefix (`antigravity/gemini-3.6-flash-high`).
  return /gemini-3[.-]/i.test(model)
}

/** One tool call off a streamed part, carrying its signature if the model signed it. */
export function toolCallFromPart(part: GeminiPart, counter: number): ToolCall | null {
  if (!part.functionCall) return null
  return {
    id: part.functionCall.id ?? `gemini-tool-${Date.now().toString(36)}-${counter}`,
    name: part.functionCall.name,
    input: part.functionCall.args ?? {},
    ...(part.thoughtSignature ? { providerSignature: part.thoughtSignature } : {}),
  }
}

function convertMessages(messages: ChatMessage[], model: string): GeminiContent[] {
  const needsSignature = requiresThoughtSignature(model)
  // A functionResponse is matched to its call by name (and id) — never by the
  // harness's own tool-call id, which is what used to be sent as the name.
  const callNames = new Map<string, string>()
  const result: GeminiContent[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', parts: [{ text: msg.content }, ...imageParts(msg)] })
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (msg.content) parts.push({ text: msg.content })
      for (const call of msg.toolCalls ?? []) {
        callNames.set(call.id, call.name)
        const signature = call.providerSignature ?? (needsSignature ? SKIP_THOUGHT_SIGNATURE : undefined)
        parts.push({
          functionCall: {
            id: call.id,
            name: call.name,
            args: typeof call.input === 'object' && call.input !== null ? (call.input as Record<string, unknown>) : {},
          },
          ...(signature ? { thoughtSignature: signature } : {}),
        })
      }
      if (parts.length > 0) result.push({ role: 'model', parts })
    } else if (msg.role === 'tool') {
      const name = (msg.toolCallId ? callNames.get(msg.toolCallId) : undefined) ?? 'tool'
      // Image results ride as sibling inlineData parts in the same user content
      // as the functionResponse — Gemini accepts multiple parts per turn.
      result.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              ...(msg.toolCallId ? { id: msg.toolCallId } : {}),
              name,
              response: { name, content: msg.content },
            },
          },
          ...imageParts(msg),
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
