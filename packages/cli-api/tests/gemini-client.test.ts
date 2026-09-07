import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { GeminiProvider } from '../src/gemini'

let originalEnv: NodeJS.ProcessEnv
let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalEnv = { ...process.env }
  originalFetch = globalThis.fetch
  delete process.env['GEMINI_API_KEY']
  delete process.env['GOOGLE_API_KEY']
  delete process.env['GEMINI_OAUTH_TOKEN']
})

afterEach(() => {
  process.env = originalEnv
  globalThis.fetch = originalFetch
})

describe('GeminiProvider', () => {
  test('throws finish+error when credentials missing', async () => {
    const p = new GeminiProvider({ apiKey: '', oauthToken: '' })
    const events: string[] = []
    await expect(async () => {
      for await (const ev of p.stream({
        systemStatic: '',
        systemDynamic: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
        model: 'gemini-2.0-flash',
        maxOutputTokens: 100,
      })) {
        events.push(ev.kind)
      }
    }).toThrow(/credentials missing/i)
    expect(events).toContain('finish')
  })

  test('accepts oauth token via constructor', () => {
    const p = new GeminiProvider({ oauthToken: 'test-token' })
    expect(p).toBeDefined()
  })

  test('accepts api key via constructor', () => {
    const p = new GeminiProvider({ apiKey: 'test-key' })
    expect(p).toBeDefined()
  })

  test('picks up GEMINI_API_KEY from env', () => {
    process.env['GEMINI_API_KEY'] = 'env-key'
    const p = new GeminiProvider()
    expect(p).toBeDefined()
  })

  test('picks up GOOGLE_API_KEY as fallback', () => {
    process.env['GOOGLE_API_KEY'] = 'google-env-key'
    const p = new GeminiProvider()
    expect(p).toBeDefined()
  })

  test('reports cached prompt tokens as a disjoint category', async () => {
    const sse =
      'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":5,"cachedContentTokenCount":80,"totalTokenCount":105}}\n\n'
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse))
            controller.close()
          },
        }),
      }) as Response) as typeof globalThis.fetch
    const p = new GeminiProvider({ apiKey: 'test-key', baseUrl: 'https://example.test' })
    const events: Array<{ kind: string; usage?: unknown }> = []
    for await (const event of p.stream({
      systemStatic: 'system',
      systemDynamic: '',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      model: 'gemini-2.5-pro',
      maxOutputTokens: 100,
    })) {
      events.push(event)
    }
    expect(events.find((event) => event.kind === 'usage')).toMatchObject({
      usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 80, cacheCreationTokens: 0 },
    })
  })
})
