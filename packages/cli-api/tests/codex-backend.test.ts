import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderRequest, ProviderStreamEvent } from '@orchentra/cli-core'
import { CodexBackendProvider, CODEX_BACKEND_URL, saveCredential, clearCredential } from '../src/index'

function baseRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    systemStatic: 'You are helpful.',
    systemDynamic: '',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    model: 'gpt-5-codex',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

function sseResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

// Two SSE frames per event: `data:` line then a blank line.
function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}

async function collect(iter: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const out: ProviderStreamEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('CodexBackendProvider', () => {
  const originalFetch = globalThis.fetch
  const originalConfigHome = process.env['ORCHENTRA_CONFIG_HOME']
  const originalOpenAiKey = process.env['OPENAI_API_KEY']
  let configHome: string

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'codex-backend-test-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = configHome
    delete process.env['OPENAI_API_KEY']
    // A ChatGPT-backend login: access token, no api key, source marker.
    saveCredential('openai', {
      accessToken: 'chatgpt-access',
      refreshToken: 'chatgpt-refresh',
      extra: { source: 'codex-chatgpt', account_id: 'acc_9' },
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    rmSync(configHome, { recursive: true, force: true })
    if (originalConfigHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = originalConfigHome
    if (originalOpenAiKey === undefined) delete process.env['OPENAI_API_KEY']
    else process.env['OPENAI_API_KEY'] = originalOpenAiKey
  })

  test('posts a Responses-API request to the ChatGPT backend with Codex auth headers', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return sseResponse(
        sse([
          { type: 'response.created', response: { model: 'gpt-5-codex' } },
          { type: 'response.output_text.delta', delta: 'ok' },
          {
            type: 'response.completed',
            response: { model: 'gpt-5-codex', usage: { input_tokens: 4, output_tokens: 1 } },
          },
        ]),
      )
    }) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    await collect(
      provider.stream(
        baseRequest({
          tools: [{ name: 'get_weather', description: 'weather', inputSchema: { type: 'object' } }],
        }),
      ),
    )

    expect(capturedUrl).toBe(CODEX_BACKEND_URL)
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer chatgpt-access')
    expect(headers['chatgpt-account-id']).toBe('acc_9')
    expect(headers['originator']).toBe('codex_cli_rs')
    expect(headers['Accept']).toBe('text/event-stream')

    const body = JSON.parse(capturedInit?.body as string)
    expect(body.model).toBe('gpt-5-codex')
    expect(body.stream).toBe(true)
    expect(body.store).toBe(false)
    expect(body.instructions).toBe('You are helpful.')
    // Responses API input items, not chat/completions messages.
    expect(body.input[0]).toEqual({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] })
    // Flat function tools (no nested `function` wrapper).
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'get_weather' })
    expect(body.tool_choice).toBe('auto')
  })

  test('streams text, a tool call, usage, and a tool_use finish', async () => {
    globalThis.fetch = (async () =>
      sseResponse(
        sse([
          { type: 'response.created', response: { model: 'gpt-5-codex' } },
          { type: 'response.output_text.delta', delta: 'Hello' },
          { type: 'response.output_text.delta', delta: ' world' },
          {
            type: 'response.output_item.added',
            item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '' },
          },
          { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"city":' },
          { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '"SF"}' },
          {
            type: 'response.output_item.done',
            item: {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'get_weather',
              arguments: '{"city":"SF"}',
            },
          },
          {
            type: 'response.completed',
            response: {
              model: 'gpt-5-codex',
              usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 3 } },
            },
          },
        ]),
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    const events = await collect(provider.stream(baseRequest()))

    const text = events
      .filter((e) => e.kind === 'text-delta')
      .map((e) => (e as { delta: string }).delta)
      .join('')
    expect(text).toBe('Hello world')

    const toolUse = events.find((e) => e.kind === 'tool-use') as
      { call: { id: string; name: string; input: unknown } } | undefined
    expect(toolUse?.call).toEqual({ id: 'call_1', name: 'get_weather', input: { city: 'SF' } })

    const usage = events.find((e) => e.kind === 'usage') as
      { usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } } | undefined
    expect(usage?.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 })

    const finish = events.at(-1) as { kind: string; stopReason: string }
    expect(finish).toEqual({ kind: 'finish', stopReason: 'tool_use' })
  })

  test('fails closed when the backend answers as a different model family', async () => {
    globalThis.fetch = (async () =>
      sseResponse(
        sse([
          { type: 'response.created', response: { model: 'gpt-4o' } },
          { type: 'response.output_text.delta', delta: 'nope' },
        ]),
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    await expect(collect(provider.stream(baseRequest({ model: 'gpt-5-codex' })))).rejects.toThrow(/provenance/i)
  })

  test('fails closed when a shorter model id is substituted (gpt-5.5 -> gpt-5)', async () => {
    globalThis.fetch = (async () =>
      sseResponse(
        sse([
          { type: 'response.created', response: { model: 'gpt-5' } },
          { type: 'response.output_text.delta', delta: 'substituted' },
        ]),
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    await expect(collect(provider.stream(baseRequest({ model: 'gpt-5.5' })))).rejects.toThrow(/provenance/i)
  })

  test('accepts a resolved dated variant of the requested model', async () => {
    globalThis.fetch = (async () =>
      sseResponse(
        sse([
          { type: 'response.created', response: { model: 'gpt-5-codex-2026-01-01' } },
          { type: 'response.output_text.delta', delta: 'ok' },
          {
            type: 'response.completed',
            response: { model: 'gpt-5-codex-2026-01-01', usage: { input_tokens: 1, output_tokens: 1 } },
          },
        ]),
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    const events = await collect(provider.stream(baseRequest({ model: 'gpt-5-codex' })))
    expect(events.some((e) => e.kind === 'text-delta')).toBe(true)
  })

  test('turns a 429 usage-limit body into a readable message with the reset time', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            type: 'usage_limit_reached',
            message: 'The usage limit has been reached',
            plan_type: 'plus',
            resets_in_seconds: 7200,
          },
        }),
        { status: 429 },
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    await expect(collect(provider.stream(baseRequest()))).rejects.toThrow(
      /ChatGPT plus usage limit reached — resets in 2h/,
    )
  })

  test('turns a 400 unsupported-model body into a hint to switch models', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ detail: "The 'gpt-5-codex' model is not supported when using Codex with a ChatGPT account." }),
        { status: 400 },
      )) as typeof globalThis.fetch

    const provider = new CodexBackendProvider()
    await expect(collect(provider.stream(baseRequest({ model: 'gpt-5-codex' })))).rejects.toThrow(
      /use `\/model gpt-5\.5`/,
    )
  })

  test('throws a clear error when not signed in to the ChatGPT backend', async () => {
    clearCredential('openai')
    const provider = new CodexBackendProvider()
    await expect(collect(provider.stream(baseRequest()))).rejects.toThrow(/Not signed in to the ChatGPT backend/)
  })
})
