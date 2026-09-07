import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderRequest, ProviderStreamEvent } from '@orchentra/cli-core'
import { GeminiCodeAssistProvider, saveCredential, clearCredential, getCredential } from '../src/index'

const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'] as const

function baseRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    systemStatic: 'You are helpful.',
    systemDynamic: '',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    model: 'gemini-3.1-pro-preview',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

function sseResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function collect(iter: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const out: ProviderStreamEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('GeminiCodeAssistProvider', () => {
  const originalFetch = globalThis.fetch
  const originalConfigHome = process.env['ORCHENTRA_CONFIG_HOME']
  const savedEnv = new Map<string, string | undefined>()
  let configHome: string

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'gemini-ca-test-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = configHome
    for (const k of ENV_KEYS) {
      savedEnv.set(k, process.env[k])
      delete process.env[k]
    }
    // A Google-account OAuth login: valid access token, no api key.
    saveCredential('gemini', {
      accessToken: 'google-access',
      refreshToken: 'google-refresh',
      expiresAt: Date.now() + 3_600_000,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    rmSync(configHome, { recursive: true, force: true })
    if (originalConfigHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = originalConfigHome
    for (const k of ENV_KEYS) {
      const v = savedEnv.get(k)
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  test('onboards the account, then streams generateContent wrapped in a project envelope', async () => {
    const calls: string[] = []
    let streamBody: Record<string, unknown> | undefined
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(url)
      if (url.includes(':loadCodeAssist')) {
        return jsonResponse({ allowedTiers: [{ id: 'free-tier', isDefault: true }] })
      }
      if (url.includes(':onboardUser')) {
        return jsonResponse({ done: true, response: { cloudaicompanionProject: { id: 'proj_123' } } })
      }
      // streamGenerateContent
      streamBody = JSON.parse(init?.body as string)
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer google-access')
      return sseResponse(
        [
          `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] } })}\n\n`,
          `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: ' world' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } } })}\n\n`,
        ].join(''),
      )
    }) as typeof globalThis.fetch

    const provider = new GeminiCodeAssistProvider()
    const events = await collect(provider.stream(baseRequest()))

    // Went through the Code Assist backend, not generativelanguage.
    expect(calls.some((u) => u.includes('cloudcode-pa.googleapis.com'))).toBe(true)
    expect(calls.some((u) => u.includes(':loadCodeAssist'))).toBe(true)
    expect(calls.some((u) => u.includes(':streamGenerateContent'))).toBe(true)

    // The generateContent payload is wrapped in { model, project, request }.
    expect(streamBody?.model).toBe('gemini-3.1-pro-preview')
    expect(streamBody?.project).toBe('proj_123')
    expect((streamBody?.request as Record<string, unknown>)?.contents).toBeDefined()

    const text = events
      .filter((e) => e.kind === 'text-delta')
      .map((e) => (e as { delta: string }).delta)
      .join('')
    expect(text).toBe('Hello world')
    const usage = events.find((e) => e.kind === 'usage') as
      { usage: { inputTokens: number; outputTokens: number } } | undefined
    expect(usage?.usage).toMatchObject({ inputTokens: 5, outputTokens: 2 })
    expect(events.at(-1)).toEqual({ kind: 'finish', stopReason: 'end_turn' })
  })

  test('caches the onboarded project so later calls skip loadCodeAssist', async () => {
    let onboardCalls = 0
    globalThis.fetch = (async (url: string) => {
      if (url.includes(':loadCodeAssist') || url.includes(':onboardUser')) {
        onboardCalls += 1
        if (url.includes(':loadCodeAssist'))
          return jsonResponse({ allowedTiers: [{ id: 'free-tier', isDefault: true }] })
        return jsonResponse({ done: true, response: { cloudaicompanionProject: 'proj_cached' } })
      }
      return sseResponse(
        `data: ${JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } })}\n\n`,
      )
    }) as typeof globalThis.fetch

    const provider = new GeminiCodeAssistProvider()
    await collect(provider.stream(baseRequest()))
    expect(getCredential('gemini')?.extra?.['code_assist_project']).toBe('proj_cached')
    const afterFirst = onboardCalls

    // Second call must not re-onboard.
    await collect(provider.stream(baseRequest()))
    expect(onboardCalls).toBe(afterFirst)
  })

  test('surfaces a clean sign-in error on 403', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes(':loadCodeAssist')) return jsonResponse({ currentTier: { id: 'free-tier' } })
      return new Response('forbidden', { status: 403 })
    }) as typeof globalThis.fetch

    const provider = new GeminiCodeAssistProvider()
    await expect(collect(provider.stream(baseRequest()))).rejects.toThrow(/sign-in was rejected \(403\)/)
  })

  test('throws a clear error when not signed in', async () => {
    clearCredential('gemini')
    const provider = new GeminiCodeAssistProvider()
    await expect(collect(provider.stream(baseRequest()))).rejects.toThrow(/Not signed in to Gemini/)
  })
})
