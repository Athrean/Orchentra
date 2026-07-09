import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnthropicProvider, toAnthropicMessages } from '../src/anthropic/client'
import type { ChatMessage, ProviderRequest, ProviderStreamEvent } from '@orchentra/cli-core'

function buildRequest(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    systemStatic: 'You are a helpful assistant.',
    systemDynamic: 'Current time: now',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    model: 'claude-sonnet-5',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function collectEvents(provider: AnthropicProvider, request: ProviderRequest): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = []
  for await (const ev of provider.stream(request)) {
    events.push(ev)
  }
  return events
}

describe('AnthropicProvider', () => {
  const originalFetch = globalThis.fetch
  let mockFetch: typeof globalThis.fetch
  let capturedRequests: { headers: Record<string, string>; body: unknown; signal?: AbortSignal | null }[] = []

  function mockServer(responses: { status?: number; body: string; headers?: Record<string, string> }[]): void {
    let callIndex = 0
    capturedRequests = []
    mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      const bodyStr = typeof init?.body === 'string' ? init.body : ''
      let parsedBody: unknown = null
      try {
        parsedBody = JSON.parse(bodyStr)
      } catch {
        /* not JSON */
      }
      capturedRequests.push({ headers: { ...(headers ?? {}) }, body: parsedBody, signal: init?.signal })

      const response = responses[callIndex++] ?? responses[responses.length - 1]
      const respHeaders = new Headers(response.headers)
      return {
        ok: (response.status ?? 200) >= 200 && (response.status ?? 200) < 300,
        status: response.status ?? 200,
        headers: respHeaders,
        text: async () => response.body,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(response.body))
            controller.close()
          },
        }),
      } as Response
    }) as typeof globalThis.fetch
    globalThis.fetch = mockFetch
  }

  function lastRequest(): {
    headers: Record<string, string>
    body: { system?: { text: string }[]; [k: string]: unknown }
    signal?: AbortSignal | null
  } {
    const req = capturedRequests[capturedRequests.length - 1]
    if (!req) throw new Error('no request captured')
    return req as never
  }

  function successSseFrame(): string {
    return [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')
  }

  // Isolate from a developer's real ~/.config/orchentra/credentials.json
  // and from any leftover state in /tmp by using a fresh tmpdir per test.
  const originalConfigHome = process.env['ORCHENTRA_CONFIG_HOME']
  const originalNoImport = process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT']
  const originalNoBanner = process.env['ORCHENTRA_NO_KEYCHAIN_BANNER']
  let configHome: string
  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'orchentra-client-test-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = configHome
    process.env['ANTHROPIC_API_KEY'] = 'test-key-123'
    // Block Keychain auto-import so the host's real Claude Code login can't
    // mask the missing-credentials path.
    process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT'] = '1'
    process.env['ORCHENTRA_NO_KEYCHAIN_BANNER'] = '1'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env['ANTHROPIC_API_KEY']
    if (existsSync(configHome)) rmSync(configHome, { recursive: true, force: true })
    if (originalConfigHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = originalConfigHome
    if (originalNoImport === undefined) delete process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT']
    else process.env['ORCHENTRA_NO_CLAUDE_CODE_IMPORT'] = originalNoImport
    if (originalNoBanner === undefined) delete process.env['ORCHENTRA_NO_KEYCHAIN_BANNER']
    else process.env['ORCHENTRA_NO_KEYCHAIN_BANNER'] = originalNoBanner
  })

  test('streams text-delta events', async () => {
    const sseStream = [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 3 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest())

    const texts = events.filter((e) => e.kind === 'text-delta')
    expect(texts).toEqual([
      { kind: 'text-delta', delta: 'Hello' },
      { kind: 'text-delta', delta: ' world' },
    ])

    const usage = events.find((e) => e.kind === 'usage')
    expect(usage).toMatchObject({
      kind: 'usage',
      usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 0, cacheCreationTokens: 0 },
    })

    const finish = events.find((e) => e.kind === 'finish')
    expect(finish).toMatchObject({ kind: 'finish', stopReason: 'end_turn' })
  })

  test('uses adaptive thinking plus output_config effort for Sonnet 5', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({ model: 'claude-sonnet-5', effort: 'medium', thinkingTokenBudget: 4096 }),
    )

    const { body } = lastRequest()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'medium' })
    expect(body.max_tokens).toBe(1024)
  })

  test('uses adaptive thinking plus output_config effort for Opus 4.8', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ model: 'claude-opus-4-8', effort: 'max', thinkingTokenBudget: 4096 }))

    const { body } = lastRequest()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'max' })
    expect(body.max_tokens).toBe(1024)
  })

  // The 4.6 generation supports both adaptive thinking and effort. Sonnet 4.6 runs
  // without thinking unless adaptive is sent explicitly, so an omitted field here
  // would silently disable it — hence adaptive, not a bare effort payload.
  test('uses adaptive thinking plus output_config effort for Sonnet 4.6', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({ model: 'claude-sonnet-4-6', effort: 'high', thinkingTokenBudget: 4096 }),
    )

    const { body } = lastRequest()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'high' })
    expect(body.max_tokens).toBe(1024)
  })

  test('uses adaptive thinking plus output_config effort for Opus 4.6', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ model: 'claude-opus-4-6', effort: 'high', thinkingTokenBudget: 4096 }))

    const { body } = lastRequest()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'high' })
  })

  test('uses adaptive thinking plus output_config effort for Fable 5', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ model: 'claude-fable-5', effort: 'xhigh', thinkingTokenBudget: 4096 }))

    const { body } = lastRequest()
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.output_config).toEqual({ effort: 'xhigh' })
  })

  // The Haiku tier has no adaptive-thinking or effort surface (effort 400s there),
  // so neither field is sent even when the runtime supplies a budget and effort.
  test('omits thinking and output_config for the Haiku tier', async () => {
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({ model: 'claude-haiku-4-5-20251001', effort: 'medium', thinkingTokenBudget: 4096 }),
    )

    const { body } = lastRequest()
    expect(body.thinking).toBeUndefined()
    expect(body.output_config).toBeUndefined()
    expect(body.max_tokens).toBe(1024)
  })

  test('passes the abort signal to fetch', async () => {
    mockServer([{ body: successSseFrame() }])
    const controller = new AbortController()

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ signal: controller.signal }))

    expect(lastRequest().signal).toBe(controller.signal)
  })

  test('streams tool-use events', async () => {
    const sseStream = [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
      sseFrame('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file', input: {} },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"path' },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '":"/tmp/f.txt"}' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 10 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest())

    const toolUse = events.find((e) => e.kind === 'tool-use')
    expect(toolUse).toMatchObject({
      kind: 'tool-use',
      call: { id: 'tool-1', name: 'read_file', input: { path: '/tmp/f.txt' } },
    })

    const finish = events.find((e) => e.kind === 'finish')
    expect(finish).toMatchObject({ kind: 'finish', stopReason: 'tool_use' })
  })

  test('streams tool-args-delta events for each input_json_delta chunk', async () => {
    const sseStream = [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
      sseFrame('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file', input: {} },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"path' },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '":"/tmp/' },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: 'f.txt"}' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 10 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest())

    const deltas = events.filter((e) => e.kind === 'tool-args-delta')
    expect(deltas).toEqual([
      { kind: 'tool-args-delta', toolUseId: 'tool-1', toolName: 'read_file', partialJson: '{"path' },
      { kind: 'tool-args-delta', toolUseId: 'tool-1', toolName: 'read_file', partialJson: '":"/tmp/' },
      { kind: 'tool-args-delta', toolUseId: 'tool-1', toolName: 'read_file', partialJson: 'f.txt"}' },
    ])

    // Deltas must precede the finalized tool-use event so the TUI can paint a
    // partial preview before parsing.
    const deltaIndex = events.findIndex((e) => e.kind === 'tool-args-delta')
    const toolUseIndex = events.findIndex((e) => e.kind === 'tool-use')
    expect(deltaIndex).toBeGreaterThan(-1)
    expect(toolUseIndex).toBeGreaterThan(deltaIndex)
  })

  test('throws on permanent error without retry', async () => {
    mockServer([{ status: 401, body: '{"error":{"message":"invalid key","type":"authentication_error"}}' }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 3 } })
    const request = buildRequest()

    try {
      await collectEvents(provider, request)
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { failureClass: string }).failureClass).toBe('provider_auth')
    }
  })

  test('retries on retryable error and succeeds', async () => {
    const sseStream = [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([
      { status: 429, body: '{"error":{"message":"rate limited"}}' },
      { status: 503, body: 'service unavailable' },
      { body: sseStream },
    ])

    const provider = new AnthropicProvider({ retries: { maxRetries: 3, initialMs: 10, maxMs: 100 } })
    const events = await collectEvents(provider, buildRequest())

    const texts = events.filter((e) => e.kind === 'text-delta')
    expect(texts).toEqual([{ kind: 'text-delta', delta: 'ok' }])
  })

  test('throws after exhausting retries', async () => {
    mockServer([
      { status: 500, body: 'error' },
      { status: 500, body: 'error' },
      { status: 500, body: 'error' },
    ])

    const provider = new AnthropicProvider({ retries: { maxRetries: 2, initialMs: 10, maxMs: 50 } })
    const request = buildRequest()

    try {
      await collectEvents(provider, request)
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { failureClass: string }).failureClass).toBe('provider_retry_exhausted')
    }
  })

  test('accepts a stream whose returned model matches the requested model', async () => {
    const sseStream = [
      sseFrame('message_start', {
        type: 'message_start',
        message: { model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'ok' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')
    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest({ model: 'claude-sonnet-5' }))

    expect(events.filter((e) => e.kind === 'text-delta')).toEqual([{ kind: 'text-delta', delta: 'ok' }])
  })

  test('fails closed when the returned model differs from the requested model', async () => {
    // Provider claims to have answered as Opus while the caller selected Sonnet:
    // a silent reroute. No fallback is enabled, so this must throw before any
    // content leaks — not stream Opus output as if it were Sonnet.
    const sseStream = [
      sseFrame('message_start', {
        type: 'message_start',
        message: { model: 'claude-opus-4-8', usage: { input_tokens: 1, output_tokens: 0 } },
      }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'leaked' },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')
    mockServer([{ body: sseStream, headers: { 'request-id': 'req_abc123' } }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })

    let leaked = false
    try {
      for await (const ev of provider.stream(buildRequest({ model: 'claude-sonnet-5' }))) {
        if (ev.kind === 'text-delta') leaked = true
      }
      expect.unreachable('Should have thrown on model mismatch')
    } catch (err: unknown) {
      expect((err as { name: string }).name).toBe('ModelProvenanceError')
      expect((err as { requestedModel: string }).requestedModel).toBe('claude-sonnet-5')
      expect((err as { actualModel: string }).actualModel).toBe('claude-opus-4-8')
      // request-id captured for provenance; no secrets in the message.
      expect((err as Error).message).toContain('req_abc123')
      expect((err as Error).message).not.toContain('test-key-123')
    }
    expect(leaked).toBe(false)
  })

  test('does not fake certainty when the provider omits a returned model', async () => {
    // message_start carries no `model` field → request-side verified only, no throw.
    mockServer([{ body: successSseFrame() }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest({ model: 'claude-sonnet-5' }))

    expect(events.filter((e) => e.kind === 'text-delta')).toEqual([{ kind: 'text-delta', delta: 'ok' }])
  })

  test('throws on missing API key', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    delete process.env['ANTHROPIC_AUTH_TOKEN']

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const request = buildRequest()

    try {
      await collectEvents(provider, request)
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { message: string }).message).toContain('ANTHROPIC_API_KEY')
    }
  })

  test('includes cache tokens in usage', async () => {
    const sseStream = [
      sseFrame('message_start', {
        type: 'message_start',
        message: {
          usage: { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 50, cache_read_input_tokens: 0 },
        },
      }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'cached' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 1, cache_read_input_tokens: 80 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest())

    const usage = events.find((e) => e.kind === 'usage')
    expect(usage).toMatchObject({
      kind: 'usage',
      usage: {
        inputTokens: 100,
        outputTokens: 1,
        cacheCreationTokens: 50,
        cacheReadTokens: 80,
      },
    })
  })

  test('streams thinking-delta and thinking-signature events', async () => {
    const sseStream = [
      sseFrame('message_start', { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me think...' },
      }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig_abc123' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sseFrame('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text' } }),
      sseFrame('content_block_delta', {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'answer' },
      }),
      sseFrame('content_block_stop', { type: 'content_block_stop', index: 1 }),
      sseFrame('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }),
      sseFrame('message_stop', { type: 'message_stop' }),
    ].join('')

    mockServer([{ body: sseStream }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    const events = await collectEvents(provider, buildRequest())

    const thinking = events.filter((e) => e.kind === 'thinking-delta')
    expect(thinking).toEqual([{ kind: 'thinking-delta', delta: 'Let me think...' }])

    const signature = events.filter((e) => e.kind === 'thinking-signature')
    expect(signature).toEqual([{ kind: 'thinking-signature', signature: 'sig_abc123' }])

    const texts = events.filter((e) => e.kind === 'text-delta')
    expect(texts).toEqual([{ kind: 'text-delta', delta: 'answer' }])
  })

  test('includes request-id in error from response headers', async () => {
    mockServer([
      {
        status: 500,
        body: '{"error":{"message":"internal error"}}',
        headers: { 'request-id': 'req-abc-123' },
      },
    ])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    try {
      await collectEvents(provider, buildRequest())
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { requestId?: string }).requestId).toBe('req-abc-123')
    }
  })

  // Tool definitions are static across a session — every turn pays for the
  // entire tools array unless we attach a cache breakpoint. Anthropic
  // semantics: a cache_control marker on the LAST tool in the array caches
  // the entire tool block (rendered before `system`). With 4-breakpoint cap
  // we want one on the tools array and one on the static system block; the
  // existing system breakpoint is preserved by injectCacheBoundary.
  test('tools: last tool has cache_control when tools are present (api-key path)', async () => {
    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({
        tools: [
          { name: 'read_file', description: 'read', inputSchema: { type: 'object' } },
          { name: 'write_file', description: 'write', inputSchema: { type: 'object' } },
        ],
      }),
    )

    const tools = lastRequest().body.tools as { name: string; cache_control?: unknown }[]
    expect(Array.isArray(tools)).toBe(true)
    expect(tools).toHaveLength(2)
    expect(tools[0]?.cache_control).toBeUndefined()
    expect(tools[1]?.cache_control).toEqual({ type: 'ephemeral' })
  })

  test('tools: single tool gets cache_control on it (last == first)', async () => {
    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({
        tools: [{ name: 'only_tool', description: 'only', inputSchema: { type: 'object' } }],
      }),
    )

    const tools = lastRequest().body.tools as { name: string; cache_control?: unknown }[]
    expect(tools).toHaveLength(1)
    expect(tools[0]?.cache_control).toEqual({ type: 'ephemeral' })
  })

  test('tools: empty tools array omits tools field entirely (no breakpoint to set)', async () => {
    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ tools: [] }))

    const body = lastRequest().body as { tools?: unknown }
    expect(body.tools).toBeUndefined()
  })
})

// Anthropic only accepts `user` and `assistant` roles. The internal
// ChatMessage shape uses `tool` for results and a parallel `toolCalls` array
// on assistants — both must be rewritten for the wire. Symptom of a
// regression: the API returns 400 with `messages: Unexpected role "tool"`
// after the very first tool call, breaking any agent loop.
describe('toAnthropicMessages', () => {
  test('plain user/assistant text passes through', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]
    expect(toAnthropicMessages(msgs)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  test('rewrites role:"tool" message to user with tool_result block', () => {
    const msgs: ChatMessage[] = [{ role: 'tool', content: 'fetched ok', toolCallId: 'call-1' }]
    expect(toAnthropicMessages(msgs)).toEqual([
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'fetched ok' }],
      },
    ])
  })

  test('rewrites assistant + toolCalls into content blocks (text + tool_use)', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'fetching now',
        toolCalls: [
          { id: 'call-1', name: 'web_fetch', input: { url: 'https://example.com' } },
          { id: 'call-2', name: 'read_file', input: { path: '/tmp/a' } },
        ],
      },
    ]
    expect(toAnthropicMessages(msgs)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'fetching now' },
          { type: 'tool_use', id: 'call-1', name: 'web_fetch', input: { url: 'https://example.com' } },
          { type: 'tool_use', id: 'call-2', name: 'read_file', input: { path: '/tmp/a' } },
        ],
      },
    ])
  })

  test('omits text block when assistant has only tool calls', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'read_file', input: { path: '/tmp/a' } }],
      },
    ]
    const result = toAnthropicMessages(msgs)
    const blocks = result[0]?.content as { type: string }[]
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('tool_use')
  })

  test('coalesces consecutive tool messages into one user message', () => {
    const msgs: ChatMessage[] = [
      { role: 'tool', content: 'A result', toolCallId: 'call-1' },
      { role: 'tool', content: 'B result', toolCallId: 'call-2' },
    ]
    expect(toAnthropicMessages(msgs)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call-1', content: 'A result' },
          { type: 'tool_result', tool_use_id: 'call-2', content: 'B result' },
        ],
      },
    ])
  })

  test('full agent turn round-trip — user, assistant w/ tool_use, tool_result, assistant text', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'fetch https://x' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'web_fetch', input: { url: 'https://x' } }],
      },
      { role: 'tool', content: '404', toolCallId: 'call-1' },
      { role: 'assistant', content: 'got 404' },
    ]
    const result = toAnthropicMessages(msgs)
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(result[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '404' }],
    })
  })
})
