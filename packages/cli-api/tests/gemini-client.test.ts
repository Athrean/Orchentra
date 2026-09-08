import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { GeminiProvider } from '../src/gemini'
import { buildGeminiRequest } from '../src/gemini/client'

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

describe('effort reaches Gemini as a thinking budget', () => {
  const base = {
    messages: [{ role: 'user' as const, content: 'hi' }],
    systemStatic: '',
    systemDynamic: '',
    tools: [],
    model: 'gemini-3-flash',
  }

  // Google is the only backend that takes effort as a token budget rather than
  // a named level, so it was the one place the /effort dial did nothing.
  test('a budget becomes generationConfig.thinkingConfig', () => {
    const body = buildGeminiRequest({ ...base, thinkingTokenBudget: 8192 } as never, 1024)
    expect(body.generationConfig?.thinkingConfig).toEqual({ thinkingBudget: 8192 })
  })

  test('no budget leaves thinkingConfig off entirely', () => {
    expect(buildGeminiRequest(base as never, 1024).generationConfig?.thinkingConfig).toBeUndefined()
  })

  test('a zero budget is omitted rather than sent as 0', () => {
    const body = buildGeminiRequest({ ...base, thinkingTokenBudget: 0 } as never, 1024)
    expect(body.generationConfig?.thinkingConfig).toBeUndefined()
  })
})

// ── Gemini 3 thought signatures ─────────────────────────────────────────────
// Regression: a tool-using turn against Antigravity died on the SECOND request
// with `400 Function call is missing a thought_signature in functionCall
// parts ... position 4`. The converter rebuilt the assistant turn's
// functionCall parts from ToolCall and had nowhere to keep the signature the
// model had signed them with, so every replay was unsigned.

describe('gemini thought signatures', () => {
  const base = {
    systemStatic: '',
    systemDynamic: '',
    tools: [],
    maxOutputTokens: 100,
  }

  const toolTurn = [
    { role: 'user' as const, content: 'list files' },
    {
      role: 'assistant' as const,
      content: '',
      toolCalls: [{ id: 'call-1', name: 'bash', input: { cmd: 'ls' }, providerSignature: 'EpoGCpcGAXLI2nx' }],
    },
    { role: 'tool' as const, content: 'README.md', toolCallId: 'call-1' },
  ]

  test('replays the signature on the functionCall part it arrived on', () => {
    const body = buildGeminiRequest({ ...base, messages: toolTurn, model: 'antigravity/gemini-3.6-flash-high' }, 8192)
    const modelTurn = body.contents.find((c) => c.role === 'model')
    expect(modelTurn?.parts[0]?.thoughtSignature).toBe('EpoGCpcGAXLI2nx')
    expect(modelTurn?.parts[0]?.functionCall?.name).toBe('bash')
  })

  test('injects the documented sentinel when a gemini-3 call has no signature', () => {
    const unsigned = [
      toolTurn[0]!,
      { role: 'assistant' as const, content: '', toolCalls: [{ id: 'call-1', name: 'bash', input: {} }] },
      toolTurn[2]!,
    ]
    const body = buildGeminiRequest({ ...base, messages: unsigned, model: 'antigravity/gemini-3.6-flash-high' }, 8192)
    const modelTurn = body.contents.find((c) => c.role === 'model')
    // Better a downgraded turn than a 400 that kills the run mid-tool-loop.
    expect(modelTurn?.parts[0]?.thoughtSignature).toBe('skip_thought_signature_validator')
  })

  test('does not invent a signature for models that never sign', () => {
    const unsigned = [
      toolTurn[0]!,
      { role: 'assistant' as const, content: '', toolCalls: [{ id: 'call-1', name: 'bash', input: {} }] },
      toolTurn[2]!,
    ]
    const body = buildGeminiRequest({ ...base, messages: unsigned, model: 'gemini-2.0-flash' }, 8192)
    const modelTurn = body.contents.find((c) => c.role === 'model')
    expect(modelTurn?.parts[0]?.thoughtSignature).toBeUndefined()
  })

  test('functionResponse is named for the tool, not the harness call id', () => {
    const body = buildGeminiRequest({ ...base, messages: toolTurn, model: 'antigravity/gemini-3.6-flash-high' }, 8192)
    const response = body.contents.at(-1)?.parts[0]?.functionResponse
    // Gemini pairs a response to its call by name; `call-1` matches no
    // declared function, so the old code sent an unpairable response.
    expect(response?.name).toBe('bash')
    expect(response?.id).toBe('call-1')
  })

  test('captures the signature off the stream so it survives to the next turn', async () => {
    const chunk = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { id: 'srv-9', name: 'bash', args: {} }, thoughtSignature: 'SIG-A' }],
          },
        },
      ],
    }
    globalThis.fetch = (async () =>
      new Response(`data: ${JSON.stringify(chunk)}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })) as unknown as typeof fetch

    const provider = new GeminiProvider({ apiKey: 'k' })
    const calls = []
    for await (const ev of provider.stream({
      ...base,
      messages: [{ role: 'user', content: 'go' }],
      model: 'gemini-3.1-pro-preview',
    })) {
      if (ev.kind === 'tool-use') calls.push(ev.call)
    }
    expect(calls[0]?.providerSignature).toBe('SIG-A')
    // Server-issued id wins over a synthesized one when Gemini supplies it.
    expect(calls[0]?.id).toBe('srv-9')
  })
})
