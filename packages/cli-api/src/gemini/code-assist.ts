import type { Provider, ProviderRequest, ProviderStreamEvent, StopReason } from '@orchentra/cli-core'
import { SseParser } from '../sse'
import { getCredential, saveCredential, type ProviderKey } from '../credential-store'
import { buildGeminiRequest, GeminiUsageAccumulator, toolCallFromPart } from './client'
import { resolveGeminiAccessToken } from './oauth'
import { ANTIGRAVITY_ENDPOINT, resolveAntigravityAccessToken } from './antigravity'
import type { GeminiStreamChunk } from './types'

// Google Code Assist — the backend the Gemini CLI / Antigravity "Login with
// Google" flow uses. A consumer Google account cannot call the API-key
// endpoint (generativelanguage.googleapis.com) with its OAuth token; instead
// the account is onboarded to a (free-tier) Code Assist project and requests go
// to cloudcode-pa.googleapis.com wrapped in a `{ model, project, request }`
// envelope. This is the analogue of the Claude Pro/Max and ChatGPT flows.
export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com'
const API_VERSION = 'v1internal'
// `pluginType` is a closed server-side enum: GEMINI and CLOUD_CODE are both
// accepted, ANTIGRAVITY and GEMINI_CLI are rejected with INVALID_ARGUMENT. The
// variant is carried by the OAuth client and the host, not by this field.
const PLUGIN_METADATA = { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' }
const ONBOARD_MAX_POLLS = 10
const ONBOARD_POLL_MS = 2000

/**
 * Which sign-in backs the request. `gemini` is the original Google OAuth client
 * against cloudcode-pa; `antigravity` is the subscription client against
 * daily-cloudcode-pa. The wire format is identical — only the credential and
 * the host differ, which is why one provider serves both.
 */
export type CodeAssistVariant = 'gemini' | 'antigravity'

/**
 * Code Assist checks the caller's User-Agent, not just the token: the same
 * credential that streams fine as `antigravity/1.0` comes back 403 "You do not
 * have a valid license of this product" under any other agent. So the agent is
 * part of the credential's identity here, and a subscription request has to
 * present the one its plan was issued to. Overridable, and the default for the
 * `gemini` variant stays Orchentra's own.
 */
const VARIANT_USER_AGENT: Record<CodeAssistVariant, string> = {
  gemini: 'OrchentraCLI/1.0',
  antigravity: 'antigravity/1.0',
}

export interface GeminiCodeAssistConfig {
  /** Override the Code Assist endpoint (tests / self-host). */
  readonly baseUrl?: string
  readonly maxTokens?: number
  readonly variant?: CodeAssistVariant
  /** Overrides the variant's User-Agent, which the backend treats as identity. */
  readonly userAgent?: string
}

export class GeminiCodeAssistProvider implements Provider {
  private readonly baseUrl: string
  private readonly maxTokens: number
  private readonly variant: CodeAssistVariant
  private readonly userAgent: string

  constructor(config: GeminiCodeAssistConfig = {}) {
    this.variant = config.variant ?? 'gemini'
    const fallback = this.variant === 'antigravity' ? ANTIGRAVITY_ENDPOINT : CODE_ASSIST_ENDPOINT
    this.baseUrl = (config.baseUrl ?? process.env['CODE_ASSIST_ENDPOINT'] ?? fallback).replace(/\/$/, '')
    this.maxTokens = config.maxTokens ?? 8192
    this.userAgent = config.userAgent ?? process.env['CODE_ASSIST_USER_AGENT'] ?? VARIANT_USER_AGENT[this.variant]
  }

  private get credentialKey(): ProviderKey {
    return this.variant === 'antigravity' ? 'antigravity' : 'gemini'
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const token =
      this.variant === 'antigravity' ? await resolveAntigravityAccessToken() : await resolveGeminiAccessToken()
    if (!token) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(
        this.variant === 'antigravity'
          ? 'Not signed in to Antigravity. Run `orchentra login antigravity` and sign in with your Google account.'
          : 'Not signed in to Gemini. Run `orchentra login gemini` and sign in with your Google account.',
      )
    }

    const project = await this.resolveProject(token)
    const body = {
      // `antigravity/` is Orchentra's routing prefix — Code Assist knows the
      // bare id and 404s on the prefixed one.
      model: request.model.replace(/^antigravity\//i, ''),
      project,
      request: buildGeminiRequest(request, this.maxTokens),
    }

    const response = await fetch(`${this.baseUrl}/${API_VERSION}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: authHeaders(token, this.userAgent),
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error(describeCodeAssistError(response.status, text))
    }
    if (!response.body) {
      yield { kind: 'finish', stopReason: 'error' as StopReason }
      throw new Error('Code Assist returned no response body')
    }

    yield* consumeCodeAssistStream(response.body)
  }

  /**
   * Resolve the Code Assist project id, onboarding the account (free tier) on
   * first use and caching the result on the gemini credential so later calls
   * skip the round-trip.
   */
  private async resolveProject(token: string): Promise<string | undefined> {
    const key = this.credentialKey
    const cred = getCredential(key)
    const cached = cred?.extra?.['code_assist_project']
    if (cached) return cached

    const project = await onboardCodeAssist(this.baseUrl, token, this.userAgent)
    if (project && cred) {
      saveCredential(key, { ...cred, extra: { ...(cred.extra ?? {}), code_assist_project: project } })
    }
    return project
  }
}

// ── Onboarding ──────────────────────────────────────────────────────────────

interface LoadResponse {
  currentTier?: { id?: string }
  allowedTiers?: Array<{ id?: string; isDefault?: boolean; userDefinedCloudaicompanionProject?: boolean }>
  cloudaicompanionProject?: string
}

interface OnboardOperation {
  done?: boolean
  response?: { cloudaicompanionProject?: string | { id?: string } }
}

async function onboardCodeAssist(baseUrl: string, token: string, userAgent: string): Promise<string | undefined> {
  const load = (await postJson(baseUrl, 'loadCodeAssist', token, userAgent, {
    metadata: PLUGIN_METADATA,
  })) as LoadResponse

  // Already onboarded — use the returned managed project (may be undefined for
  // the free tier, which streamGenerateContent then handles project-less).
  if (load.currentTier?.id) return load.cloudaicompanionProject

  const tier = load.allowedTiers?.find((t) => t.isDefault) ?? load.allowedTiers?.[0]
  const tierId = tier?.id ?? 'free-tier'

  let op = (await postJson(baseUrl, 'onboardUser', token, userAgent, {
    tierId,
    cloudaicompanionProject: load.cloudaicompanionProject,
    metadata: PLUGIN_METADATA,
  })) as OnboardOperation

  for (let i = 0; i < ONBOARD_MAX_POLLS && !op.done; i += 1) {
    await sleep(ONBOARD_POLL_MS)
    op = (await postJson(baseUrl, 'onboardUser', token, userAgent, {
      tierId,
      cloudaicompanionProject: load.cloudaicompanionProject,
      metadata: PLUGIN_METADATA,
    })) as OnboardOperation
  }

  const project = op.response?.cloudaicompanionProject
  if (typeof project === 'string') return project
  return project?.id ?? load.cloudaicompanionProject
}

async function postJson(
  baseUrl: string,
  method: string,
  token: string,
  userAgent: string,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/${API_VERSION}:${method}`, {
    method: 'POST',
    headers: authHeaders(token, userAgent),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(describeCodeAssistError(res.status, text, method))
  }
  return res.json().catch(() => ({}))
}

// ── Stream consumption ──────────────────────────────────────────────────────

async function* consumeCodeAssistStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderStreamEvent> {
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
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        const parsed = safeParse(frame.data)
        if (!parsed) continue
        // Code Assist wraps the generateContent payload in a `response` envelope.
        const chunk = (parsed.response ?? parsed) as GeminiStreamChunk

        if (chunk.promptFeedback?.blockReason) stopReason = 'error'
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

        if (candidate.finishReason) stopReason = mapFinishReason(candidate.finishReason, sawToolCall)
      }
    }

    yield usage.event()
    yield { kind: 'finish', stopReason }
  } finally {
    reader.releaseLock()
  }
}

function authHeaders(token: string, userAgent: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'user-agent': userAgent,
    Authorization: `Bearer ${token}`,
  }
}

function describeCodeAssistError(status: number, text: string, method?: string): string {
  const where = method ? ` (${method})` : ''
  if (status === 403 && /valid license/i.test(text)) {
    // Distinct from an expired token: the account is not licensed for this
    // product, so signing in again changes nothing.
    return `Google rejected this request (403)${where}: the signed-in account has no license for this product. Check the plan on the account you signed in with.`
  }
  if (status === 401 || status === 403) {
    return `Google sign-in was rejected (${status})${where}. Run \`orchentra login\` to sign in again.`
  }
  if (status === 429) {
    return `Gemini (Code Assist) rate/usage limit reached (429)${where}. Try again later.`
  }
  let message: string | undefined
  try {
    message = (JSON.parse(text) as { error?: { message?: string } }).error?.message
  } catch {
    /* not JSON */
  }
  return `Code Assist error${where}: ${status}${message ? ` ${message}` : ` ${redact(text)}`}`
}

interface CodeAssistFrame {
  response?: unknown
  candidates?: unknown
  usageMetadata?: unknown
  promptFeedback?: unknown
}

function safeParse(text: string): CodeAssistFrame | null {
  try {
    return JSON.parse(text) as CodeAssistFrame
  } catch {
    return null
  }
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

function redact(text: string): string {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]').slice(0, 300)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
