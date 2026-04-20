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

  function mockServer(responses: { status?: number; body: string; headers?: Record<string, string> }[]): void {
    let callIndex = 0
    mockFetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
      const response = responses[callIndex++] ?? responses[responses.length - 1]
      const headers = new Headers(response.headers)
      return {
        ok: (response.status ?? 200) >= 200 && (response.status ?? 200) < 300,
        status: response.status ?? 200,
        headers,
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

  beforeEach(() => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key-123'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env['ANTHROPIC_API_KEY']
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

  test('enriches auth error when sk-ant- key used as bearer token', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'sk-ant-api03-wrong-placement'

    mockServer([{ status: 401, body: '{"error":{"message":"invalid request","type":"authentication_error"}}' }])

    const provider = new AnthropicProvider({ retries: { maxRetries: 0 } })
    try {
      await collectEvents(provider, buildRequest())
      expect.unreachable('Should have thrown')
    } catch (err: unknown) {
      expect((err as { message: string }).message).toContain('sk-ant-* keys go in ANTHROPIC_API_KEY')
    } finally {
      delete process.env['ANTHROPIC_AUTH_TOKEN']
    }
  })
})
