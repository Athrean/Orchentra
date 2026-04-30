import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { AnthropicProvider } from '../src/anthropic/client'
import type { ProviderRequest, ProviderStreamEvent } from '@orchentra/cli-core'

function buildRequest(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    systemStatic: 'You are a helpful assistant.',
    systemDynamic: 'Current time: now',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    model: 'claude-sonnet-4-20250514',
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
  let capturedRequests: { headers: Record<string, string>; body: unknown }[] = []

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
      capturedRequests.push({ headers: { ...(headers ?? {}) }, body: parsedBody })

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
  // (Bun's homedir() ignores HOME, so we use ORCHENTRA_CONFIG_HOME which
  // credentialsPath honors). Without isolation, "throws on missing API
  // key" leaks the real OAuth bundle in.
  const originalConfigHome = process.env['ORCHENTRA_CONFIG_HOME']
  beforeEach(() => {
    process.env['ORCHENTRA_CONFIG_HOME'] = '/tmp/orchentra-test-config-empty'
    process.env['ANTHROPIC_API_KEY'] = 'test-key-123'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env['ANTHROPIC_API_KEY']
    if (originalConfigHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = originalConfigHome
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

  test('enriches auth error when sk-ant-api03- API key used as bearer token', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-api03-wrong-placement'

    mockServer([{ status: 401, body: '{"error":{"message":"invalid request","type":"authentication_error"}}' }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    try {
      await collectEvents(provider, buildRequest())
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { message: string }).message).toContain('sk-ant-api03-* keys go in ANTHROPIC_API_KEY')
    } finally {
      delete process.env['ANTHROPIC_AUTH_TOKEN']
    }
  })

  test('does NOT enrich auth error when sk-ant-oat01- OAuth token is used as bearer', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-correct-oauth-token'

    mockServer([{ status: 401, body: '{"error":{"message":"OAuth not supported","type":"authentication_error"}}' }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    try {
      await collectEvents(provider, buildRequest())
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      const msg = (err as { message: string }).message
      expect(msg).not.toContain('ANTHROPIC_API_KEY')
      expect(msg).toContain('OAuth not supported')
    } finally {
      delete process.env['ANTHROPIC_AUTH_TOKEN']
    }
  })

  test('OAuth bearer requests include oauth-2025-04-20 + claude-code agentic beta headers', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-test-bearer'

    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest())

    const beta = lastRequest().headers['anthropic-beta'] ?? ''
    expect(beta).toContain('oauth-2025-04-20')
    expect(beta).toContain('claude-code-20250219')
    expect(beta).toContain('interleaved-thinking-2025-05-14')
    expect(beta).toContain('fine-grained-tool-streaming-2025-05-14')

    delete process.env['ANTHROPIC_AUTH_TOKEN']
  })

  test('API key requests do NOT include OAuth-only beta headers', async () => {
    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest())

    const beta = lastRequest().headers['anthropic-beta'] ?? ''
    expect(beta).not.toContain('oauth-2025-04-20')
    expect(beta).not.toContain('claude-code-20250219')
  })

  test('OAuth bearer requests prefix system prompt with Claude Code identity', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-test-bearer'

    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest())

    const system = lastRequest().body.system as { text: string }[]
    expect(system).toBeDefined()
    expect(system[0]?.text ?? '').toContain("You are Claude Code, Anthropic's official CLI for Claude.")

    delete process.env['ANTHROPIC_AUTH_TOKEN']
  })

  // Anthropic returns 429 ("This credential is only authorized for use with
  // Claude Code") when the prefix is concatenated into the user's system
  // prompt. The prefix MUST be its OWN first block. Validated against live
  // /v1/messages on 2026-04-30 — single-block returned 429, two-block returned
  // 200. Without this check we silently regress and hang on retry.
  test('OAuth: Claude Code prefix is its OWN first system block (not concatenated)', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-test-bearer'

    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(
      provider,
      buildRequest({ systemStatic: 'CUSTOM_STATIC_RULES', systemDynamic: 'CUSTOM_DYNAMIC_NOTES' }),
    )

    const system = lastRequest().body.system as { text: string; cache_control?: unknown }[]
    expect(Array.isArray(system)).toBe(true)
    expect(system).toHaveLength(3)
    expect(system[0]?.text).toBe("You are Claude Code, Anthropic's official CLI for Claude.")
    expect(system[0]?.cache_control).toBeUndefined()
    expect(system[1]?.text).toBe('CUSTOM_STATIC_RULES')
    expect(system[1]?.cache_control).toEqual({ type: 'ephemeral' })
    expect(system[2]?.text).toBe('CUSTOM_DYNAMIC_NOTES')

    delete process.env['ANTHROPIC_AUTH_TOKEN']
  })

  test('OAuth + empty systemStatic: still emits prefix block', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-oat01-test-bearer'

    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest({ systemStatic: '', systemDynamic: '' }))

    const system = lastRequest().body.system as { text: string }[]
    expect(system).toHaveLength(1)
    expect(system[0]?.text).toBe("You are Claude Code, Anthropic's official CLI for Claude.")

    delete process.env['ANTHROPIC_AUTH_TOKEN']
  })

  test('API key requests do NOT prepend Claude Code identity to system prompt', async () => {
    mockServer([{ body: successSseFrame() }])
    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    await collectEvents(provider, buildRequest())

    const system = lastRequest().body.system as { text: string }[]
    expect(system[0]?.text ?? '').not.toContain('You are Claude Code')
  })
})
