import type {
  ChatMessage,
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderToolSchema,
  StopReason,
} from '@orchentra/cli-core'
import { emptyUsage } from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { parseToolArguments } from '../tool-arguments'
import { ModelProvenanceError } from '../model-provenance'
import { resolveCodexBackendAuth } from './codex-oauth'

// The private ChatGPT backend the official Codex CLI talks to for Plus/Pro
// subscriptions (openai/codex → codex-rs/core/src/client.rs). It speaks the
// OpenAI *Responses* API — NOT chat/completions — and authenticates with the
// ChatGPT OAuth access token plus the `chatgpt-account-id` header. Personal
// ChatGPT plans cannot mint a platform API key, so this is the only path that
// lets a ChatGPT subscription drive models (the exact analogue of using a
// Claude Pro/Max OAuth bearer against api.anthropic.com).
//
// NOTE: this endpoint is undocumented and Codex-client-specific. We present as
// the Codex CLI (same OAuth client id + `originator`) because that is the
// client the subscription is licensed for; using it from elsewhere may violate
// OpenAI's terms. Enabled only when the user explicitly signs in this way.
export const CODEX_BACKEND_URL = 'https://chatgpt.com/backend-api/codex/responses'
const ORIGINATOR = 'codex_cli_rs'
const USER_AGENT = 'codex_cli_rs/0.0.0 (Orchentra)'
const OPENAI_BETA = 'responses=experimental'

export interface CodexBackendConfig {
  /** Override the backend URL (tests / self-host). */
  readonly baseUrl?: string
}

export class CodexBackendProvider implements Provider {
  private readonly url: string

  constructor(config: CodexBackendConfig = {}) {
    this.url = config.baseUrl ?? CODEX_BACKEND_URL
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const auth = await resolveCodexBackendAuth()
    if (!auth) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(
        'Not signed in to the ChatGPT backend. Run `orchentra login openai` and sign in with your ChatGPT Plus/Pro account.',
      )
    }

    const sessionId = randomId()
    const body = buildResponsesRequest(request, sessionId)

    // Auth-expiry retry: fire once; on 401 force-refresh the token and retry.
    let response = await this.post(body, auth.accessToken, auth.accountId, sessionId, request.signal)
    if (response.status === 401) {
      const refreshed = await resolveCodexBackendAuth({ forceRefresh: true })
      if (refreshed && refreshed.accessToken !== auth.accessToken) {
        response = await this.post(body, refreshed.accessToken, refreshed.accountId, sessionId, request.signal)
      }
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(describeBackendError(response.status, text))
    }
    if (!response.body) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error('ChatGPT backend returned no response body')
    }

    yield* consumeResponsesStream(response.body, request.model)
  }

  private post(
    body: Record<string, unknown>,
    accessToken: string,
    accountId: string | undefined,
    sessionId: string,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
      'OpenAI-Beta': OPENAI_BETA,
      originator: ORIGINATOR,
      session_id: sessionId,
      'User-Agent': USER_AGENT,
    }
    if (accountId) headers['chatgpt-account-id'] = accountId
    return fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  }
}

// ── Request building ────────────────────────────────────────────────────────

function buildResponsesRequest(request: ProviderRequest, sessionId: string): Record<string, unknown> {
  const instructions = [request.systemStatic, request.systemDynamic].filter((s) => s && s.length > 0).join('\n\n')
  const body: Record<string, unknown> = {
    model: request.model,
    input: request.messages.flatMap(toResponsesInputItems),
    stream: true,
    store: false,
    // Stable per-session key so the backend can reuse its prompt cache.
    prompt_cache_key: sessionId,
  }
  if (instructions.length > 0) body.instructions = instructions
  if (request.effort) {
    // Responses reasoning effort is minimal|low|medium|high; the higher
    // Orchentra tiers clamp to 'high' on the wire. `summary: auto` surfaces
    // reasoning summaries, which we render as thinking deltas.
    const effort = request.effort === 'xhigh' || request.effort === 'max' ? 'high' : request.effort
    body.reasoning = { effort, summary: 'auto' }
  }
  if (request.tools.length > 0) {
    body.tools = request.tools.map(toResponsesTool)
    body.tool_choice = 'auto'
    body.parallel_tool_calls = false
  }
  return body
}

interface ResponsesInputItem {
  type: string
  role?: string
  content?: Array<{ type: string; text: string }>
  call_id?: string
  name?: string
  arguments?: string
  output?: string
}

// A single ChatMessage can map to several Responses input items — an assistant
// turn with text AND tool calls becomes a message item plus one function_call
// item per call, which the Responses API models separately.
function toResponsesInputItems(msg: ChatMessage): ResponsesInputItem[] {
  if (msg.role === 'tool') {
    return [{ type: 'function_call_output', call_id: msg.toolCallId ?? '', output: msg.content }]
  }
  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    const items: ResponsesInputItem[] = []
    if (msg.content)
      items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: msg.content }] })
    for (const call of msg.toolCalls) {
      items.push({
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: typeof call.input === 'string' ? call.input : JSON.stringify(call.input ?? {}),
      })
    }
    return items
  }
  const contentType = msg.role === 'assistant' ? 'output_text' : 'input_text'
  return [{ type: 'message', role: msg.role, content: [{ type: contentType, text: msg.content }] }]
}

function toResponsesTool(tool: ProviderToolSchema): Record<string, unknown> {
  // Responses API function tools are flat (no nested `function` wrapper).
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false,
  }
}

// ── Stream consumption ──────────────────────────────────────────────────────

async function* consumeResponsesStream(
  body: ReadableStream<Uint8Array>,
  requestedModel: string,
): AsyncIterable<ProviderStreamEvent> {
  const parser = new SseParser()
  const decoder = new TextDecoder()
  const reader = body.getReader()
  // Pending function calls keyed by the Responses item id, so streamed
  // argument deltas can be attached to the right call.
  const pending = new Map<string, { callId: string; name: string; args: string }>()
  let sawToolCall = false
  let stopReason: StopReason = 'end_turn'
  let usage = emptyUsage()
  let provenanceChecked = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        const event = safeParse(frame.data)
        if (!event) continue

        switch (event.type) {
          case 'response.created':
          case 'response.completed':
          case 'response.in_progress': {
            const model = readString((event.response as Record<string, unknown> | undefined)?.model)
            if (!provenanceChecked && model) {
              assertBackendProvenance(requestedModel, model)
              provenanceChecked = true
            }
            if (event.type === 'response.completed') {
              const resp = event.response as Record<string, unknown> | undefined
              usage = readUsage(resp?.usage) ?? usage
              if (
                readString((resp?.incomplete_details as Record<string, unknown> | undefined)?.reason) ===
                'max_output_tokens'
              ) {
                stopReason = 'max_tokens'
              }
            }
            break
          }

          case 'response.output_text.delta': {
            const delta = readString(event.delta)
            if (delta) yield { kind: 'text-delta', delta }
            break
          }

          case 'response.reasoning_summary_text.delta':
          case 'response.reasoning_text.delta': {
            const delta = readString(event.delta)
            if (delta) yield { kind: 'thinking-delta', delta }
            break
          }

          case 'response.output_item.added': {
            const item = event.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') {
              const id = readString(item.id) ?? readString(item.call_id) ?? randomId()
              pending.set(id, {
                callId: readString(item.call_id) ?? id,
                name: readString(item.name) ?? '',
                args: readString(item.arguments) ?? '',
              })
            }
            break
          }

          case 'response.function_call_arguments.delta': {
            const id = readString(event.item_id)
            const delta = readString(event.delta)
            if (id && delta != null) {
              const p = pending.get(id)
              if (p) {
                p.args += delta
                yield { kind: 'tool-args-delta', toolUseId: p.callId, toolName: p.name, partialJson: delta }
              }
            }
            break
          }

          case 'response.output_item.done': {
            const item = event.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') {
              const id = readString(item.id) ?? ''
              const p = pending.get(id)
              const callId = readString(item.call_id) ?? p?.callId ?? id
              const name = readString(item.name) ?? p?.name ?? ''
              const rawArgs = readString(item.arguments) ?? p?.args ?? ''
              const { args } = parseToolArguments(rawArgs, name)
              sawToolCall = true
              yield { kind: 'tool-use', call: { id: callId, name, input: args } }
              pending.delete(id)
            }
            break
          }

          case 'response.failed':
          case 'error': {
            const resp = event.response as Record<string, unknown> | undefined
            const err = (resp?.error ?? event.error) as Record<string, unknown> | undefined
            const message = readString(err?.message) ?? 'ChatGPT backend reported a stream error'
            yield { kind: 'finish', stopReason: 'error' as StopReason }
            throw new Error(`ChatGPT backend: ${message}`)
          }
        }
      }
    }

    if (sawToolCall && stopReason === 'end_turn') stopReason = 'tool_use'
    yield { kind: 'usage', usage }
    yield { kind: 'finish', stopReason }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Fail closed unless the backend answers as the SAME model id — the only
 * tolerated difference is a resolved dated snapshot of that exact id
 * (`gpt-5.5` → `gpt-5.5-2026-01-01`). A different id (`gpt-5.5` → `gpt-5.4`,
 * or `gpt-4o`) is a silent substitution and throws. Note: only a trailing
 * `-YYYY-MM-DD` is stripped, so `gpt-5.4` never accepts `gpt-5.4-mini` and
 * `gpt-5.5` never accepts `gpt-5`.
 */
function assertBackendProvenance(requested: string, actual: string): void {
  if (actual === requested) return
  if (actual.replace(/-\d{4}-\d{2}-\d{2}$/, '') === requested) return
  throw new ModelProvenanceError(requested, actual, 'openai-chatgpt')
}

interface StreamUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

function readUsage(raw: unknown): StreamUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const details = u.input_tokens_details as Record<string, unknown> | undefined
  return {
    inputTokens: readNumber(u.input_tokens) ?? 0,
    outputTokens: readNumber(u.output_tokens) ?? 0,
    cacheReadTokens: readNumber(details?.cached_tokens) ?? 0,
    cacheCreationTokens: 0,
  }
}

interface ResponsesEvent {
  type?: string
  delta?: unknown
  item?: unknown
  item_id?: unknown
  response?: unknown
  error?: unknown
}

function safeParse(text: string): ResponsesEvent | null {
  try {
    const parsed = JSON.parse(text) as ResponsesEvent
    return parsed && typeof parsed.type === 'string' ? parsed : null
  } catch {
    return null
  }
}

function readString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function readNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// Turn a backend error response into a readable message. Known shapes
// (usage limit, auth) get an actionable sentence; anything else falls back to
// the status + a redacted body so no stray token reaches a log or the UI.
function describeBackendError(status: number, text: string): string {
  const err = parseErrorBody(text)
  if (status === 429 || err?.type === 'usage_limit_reached') {
    const plan = err?.plan_type ? `ChatGPT ${err.plan_type}` : 'ChatGPT'
    const resetsIn =
      typeof err?.resets_in_seconds === 'number' ? ` — resets in ${formatDuration(err.resets_in_seconds)}` : ''
    const resetsAt =
      typeof err?.resets_at === 'number' ? ` (at ${new Date(err.resets_at * 1000).toLocaleString()})` : ''
    return (
      `${plan} usage limit reached${resetsIn}${resetsAt}. ` +
      'Your ChatGPT subscription quota for Codex is used up — wait for the reset, or use an API key ' +
      '(`orchentra login openai --api-key sk-...`).'
    )
  }
  if (status === 401 || status === 403) {
    return 'ChatGPT sign-in was rejected (401/403). Run `orchentra login openai` to sign in again.'
  }
  if (err?.message && /not supported when using Codex with a ChatGPT account|not supported/i.test(err.message)) {
    // A ChatGPT account only exposes a subset of models via the Codex backend.
    return `${err.message} On a ChatGPT plan use \`/model gpt-5.5\` (the current Codex model).`
  }
  if (err?.message) return `ChatGPT backend error (${status}): ${err.message}`
  return `ChatGPT backend error: ${status} ${redactToken(text)}`
}

interface BackendError {
  type?: string
  message?: string
  plan_type?: string
  resets_at?: number
  resets_in_seconds?: number
}

function parseErrorBody(text: string): BackendError | null {
  try {
    const json = JSON.parse(text) as { error?: BackendError | string; detail?: string }
    // Two shapes seen from the backend: {error:{...}} (usage limit) and
    // {detail:"..."} (unsupported model). Normalize both to a message.
    if (json.error && typeof json.error === 'object') return json.error
    if (typeof json.error === 'string') return { message: json.error }
    if (typeof json.detail === 'string') return { message: json.detail }
    return null
  } catch {
    return null
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

// Never let a stray token in an error body reach a log or the UI.
function redactToken(text: string): string {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]').slice(0, 300)
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}
