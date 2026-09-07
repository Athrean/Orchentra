// OpenAI Responses API client. Several gateway-hosted families (GPT, Grok,
// Muse Spark) are served only at `/v1/responses`, which is a different wire
// protocol from `/v1/chat/completions`: input items instead of messages,
// `output` items instead of choices, and typed SSE events instead of deltas.
// Sending a chat/completions body to those models fails opaquely, so they get
// their own converter rather than a coerced one.

import { emptyUsage } from '@orchentra/cli-core'
import type {
  ChatMessage,
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderToolSchema,
  StopReason,
  UsageTotals,
} from '@orchentra/cli-core'
import { assertModelProvenance } from '../model-provenance'
import { parseToolArguments } from '../tool-arguments'
import { SseParser } from '../sse'
import { newSessionId } from '../session-id'
import { isRetryableStatus } from '../errors'
import { fetchWithRetry } from '../retry'

export interface ResponsesConfig {
  readonly providerName: string
  readonly apiKeyEnv: string
  readonly baseUrlEnv: string
  readonly defaultBaseUrl: string
  /** Routing prefix stripped before the model id goes on the wire. */
  readonly modelPrefix?: string
  /**
   * Header carrying a per-conversation routing id. The Zen gateway rejects a
   * request without one ("Request is missing x-opencode-session and cannot be
   * routed efficiently"), and the id is what gives a conversation cache
   * affinity, so it is generated once per provider instance, not per request.
   */
  readonly sessionHeader?: string
}

interface ResponsesUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

interface ResponsesItem {
  type?: string
  name?: string
  call_id?: string
  arguments?: string
}

interface ResponsesEvent {
  type?: string
  delta?: string
  item?: ResponsesItem
  item_id?: string
  response?: { model?: string; status?: string; usage?: ResponsesUsage; incomplete_details?: { reason?: string } }
}

export class ResponsesProvider implements Provider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly sessionId = newSessionId()

  constructor(
    private readonly config: ResponsesConfig,
    apiKey?: string,
    baseUrl?: string,
  ) {
    this.apiKey = apiKey ?? process.env[config.apiKeyEnv] ?? ''
    this.baseUrl = (baseUrl ?? process.env[config.baseUrlEnv] ?? config.defaultBaseUrl).replace(/\/$/, '')
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const wireModel = this.stripPrefix(request.model)
    const response = await fetchWithRetry(
      () =>
        fetch(`${this.baseUrl}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.config.sessionHeader ? { [this.config.sessionHeader]: this.sessionId } : {}),
          },
          body: JSON.stringify(buildResponsesBody({ ...request, model: wireModel })),
          signal: request.signal,
        }),
      isRetryableStatus,
      { ...(request.signal ? { signal: request.signal } : {}) },
    )

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(`${this.config.providerName} API error: ${response.status} ${text}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = new SseParser()
    // A function call's name arrives on `output_item.added` while its arguments
    // stream separately, so the id → name map is what lets an argument delta be
    // attributed before the item completes.
    const pending = new Map<string, { name: string; callId: string; args: string }>()
    let verified = false
    let sawToolCall = false
    let stopReason: StopReason = 'end_turn'

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        const event = safeParse(frame.data)
        if (!event) continue
        if (!verified && event.response?.model) {
          assertModelProvenance(wireModel, event.response.model, this.config.providerName)
          verified = true
        }

        switch (event.type) {
          case 'response.output_text.delta':
            if (event.delta) yield { kind: 'text-delta', delta: event.delta }
            break

          case 'response.output_item.added':
            if (event.item?.type === 'function_call' && event.item_id) {
              pending.set(event.item_id, {
                name: event.item.name ?? '',
                callId: event.item.call_id ?? event.item_id,
                args: '',
              })
            }
            break

          case 'response.function_call_arguments.delta': {
            const entry = event.item_id ? pending.get(event.item_id) : undefined
            if (entry && event.delta) {
              entry.args += event.delta
              yield {
                kind: 'tool-args-delta',
                toolUseId: entry.callId,
                toolName: entry.name,
                partialJson: event.delta,
              }
            }
            break
          }

          case 'response.output_item.done': {
            if (event.item?.type !== 'function_call') break
            const entry = event.item_id ? pending.get(event.item_id) : undefined
            const callId = event.item.call_id ?? entry?.callId ?? event.item_id ?? ''
            const name = event.item.name ?? entry?.name ?? ''
            const { args } = parseToolArguments(event.item.arguments ?? entry?.args, name)
            if (event.item_id) pending.delete(event.item_id)
            sawToolCall = true
            yield { kind: 'tool-use', call: { id: callId, name, input: args } }
            break
          }

          case 'response.completed':
          case 'response.incomplete':
          case 'response.failed': {
            const usage = event.response?.usage
            if (usage) yield { kind: 'usage', ...convertUsage(usage) }
            if (event.type === 'response.failed') stopReason = 'error'
            else if (event.response?.incomplete_details?.reason === 'max_output_tokens') stopReason = 'max_tokens'
            else if (sawToolCall) stopReason = 'tool_use'
            yield { kind: 'finish', stopReason }
            return
          }
        }
      }
    }

    // The stream ended without a terminal response event: report what was
    // actually seen instead of inventing a clean completion.
    yield { kind: 'usage', usage: emptyUsage() }
    yield { kind: 'finish', stopReason: sawToolCall ? 'tool_use' : stopReason }
  }

  private stripPrefix(model: string): string {
    const prefix = this.config.modelPrefix
    return prefix && model.startsWith(prefix) ? model.slice(prefix.length) : model
  }
}

/** Cached input is reported inside `input_tokens`; Orchentra stores disjoint categories. */
function convertUsage(usage: ResponsesUsage): { usage: UsageTotals; cacheReadReported: boolean } {
  const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0
  return {
    cacheReadReported: usage.input_tokens_details?.cached_tokens !== undefined,
    usage: {
      inputTokens: Math.max(0, (usage.input_tokens ?? 0) - cacheReadTokens),
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens,
      cacheCreationTokens: 0,
    },
  }
}

export function buildResponsesBody(request: ProviderRequest): Record<string, unknown> {
  const instructions = [request.systemStatic, request.systemDynamic].filter((part) => part.trim()).join('\n\n')
  const body: Record<string, unknown> = {
    model: request.model,
    input: request.messages.flatMap(toInputItems),
    stream: true,
    max_output_tokens: request.maxOutputTokens,
  }
  if (instructions) body.instructions = instructions
  if (request.tools.length > 0) body.tools = request.tools.map(toResponsesTool)
  if (request.effort) body.reasoning = { effort: mapEffort(request.effort) }
  return body
}

function toResponsesTool(tool: ProviderToolSchema): Record<string, unknown> {
  return { type: 'function', name: tool.name, description: tool.description, parameters: tool.inputSchema }
}

/** Responses input is a flat item list: a turn's tool calls are siblings of its text. */
function toInputItems(message: ChatMessage): Record<string, unknown>[] {
  if (message.images?.length) {
    throw new Error('Responses provider: image content is not supported for this model')
  }
  if (message.role === 'tool') {
    return [{ type: 'function_call_output', call_id: message.toolCallId ?? '', output: message.content }]
  }
  const items: Record<string, unknown>[] = []
  if (message.content.trim()) items.push({ role: message.role, content: message.content })
  for (const call of message.toolCalls ?? []) {
    items.push({
      type: 'function_call',
      call_id: call.id,
      name: call.name,
      arguments: JSON.stringify(call.input ?? {}),
    })
  }
  return items
}

/** Responses accepts low/medium/high only; the higher Orchentra tiers clamp to high. */
function mapEffort(effort: string): string {
  return effort === 'low' || effort === 'medium' ? effort : 'high'
}

function safeParse(data: string): ResponsesEvent | null {
  if (!data || data === '[DONE]') return null
  try {
    return JSON.parse(data) as ResponsesEvent
  } catch {
    return null
  }
}
