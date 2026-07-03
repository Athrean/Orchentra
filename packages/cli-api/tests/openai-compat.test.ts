import { afterEach, describe, expect, test } from 'bun:test'
import type { ChatMessage, ProviderRequest, ProviderToolSchema } from '@orchentra/cli-core'

import { OpenAiCompatProvider, OPENAI_CONFIG, XAI_CONFIG, LOCAL_CONFIG } from '../src/openai-compat'
import { convertMessage, convertTool } from '../src/openai-compat/client'

function request(overrides?: Partial<ProviderRequest>): ProviderRequest {
  return {
    systemStatic: 'system',
    systemDynamic: '',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [],
    model: 'gpt-5',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

function successStream(): string {
  return ['data: {"choices":[{"delta":{"content":"ok"}}]}', 'data: [DONE]', ''].join('\n\n')
}

describe('OpenAiCompatProvider effort', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('sends reasoning_effort for OpenAI-compatible OpenAI requests', async () => {
    const bodies: unknown[] = []
    globalThis.fetch = mockFetch(bodies)

    const provider = new OpenAiCompatProvider(OPENAI_CONFIG, 'key', 'https://example.test/v1')
    await drain(provider.stream(request({ effort: 'high' })))

    expect(bodies[0]).toMatchObject({ reasoning_effort: 'high' })
  })

  test('does not send reasoning_effort to non-OpenAI compatible providers', async () => {
    const bodies: unknown[] = []
    globalThis.fetch = mockFetch(bodies)

    const provider = new OpenAiCompatProvider(XAI_CONFIG, 'key', 'https://example.test/v1')
    await drain(provider.stream(request({ model: 'grok-3', effort: 'high' })))

    expect(bodies[0]).not.toHaveProperty('reasoning_effort')
  })

  test('does not send reasoning_effort to non-reasoning OpenAI chat models', async () => {
    const bodies: unknown[] = []
    globalThis.fetch = mockFetch(bodies)

    const provider = new OpenAiCompatProvider(OPENAI_CONFIG, 'key', 'https://example.test/v1')
    await drain(provider.stream(request({ model: 'gpt-4o', effort: 'high' })))

    expect(bodies[0]).not.toHaveProperty('reasoning_effort')
  })
})

describe('OpenAiCompatProvider local (Ollama) preset', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('LOCAL_CONFIG defaults to the Ollama OpenAI-compatible endpoint', () => {
    expect(LOCAL_CONFIG.defaultBaseUrl).toBe('http://localhost:11434/v1')
    expect(LOCAL_CONFIG.baseUrlEnv).toBe('OLLAMA_BASE_URL')
  })

  test('posts to the local base URL and strips the ollama/ prefix from the wire model', async () => {
    const bodies: unknown[] = []
    const urls: string[] = []
    globalThis.fetch = mockFetch(bodies, urls)

    const provider = new OpenAiCompatProvider(LOCAL_CONFIG)
    await drain(provider.stream(request({ model: 'ollama/llama3' })))

    expect(urls[0]).toBe('http://localhost:11434/v1/chat/completions')
    expect(bodies[0]).toMatchObject({ model: 'llama3' })
  })

  test('honours OLLAMA_BASE_URL override for a self-hosted OpenAI-compatible server', async () => {
    const bodies: unknown[] = []
    const urls: string[] = []
    globalThis.fetch = mockFetch(bodies, urls)

    const provider = new OpenAiCompatProvider(LOCAL_CONFIG, undefined, 'http://192.168.1.9:1234/v1')
    await drain(provider.stream(request({ model: 'ollama/qwen2.5-coder' })))

    expect(urls[0]).toBe('http://192.168.1.9:1234/v1/chat/completions')
    expect(bodies[0]).toMatchObject({ model: 'qwen2.5-coder' })
  })

  test('does not send reasoning_effort to the local provider', async () => {
    const bodies: unknown[] = []
    globalThis.fetch = mockFetch(bodies)

    const provider = new OpenAiCompatProvider(LOCAL_CONFIG)
    await drain(provider.stream(request({ model: 'ollama/qwen2.5-coder', effort: 'high' })))

    expect(bodies[0]).not.toHaveProperty('reasoning_effort')
  })
})

describe('convertMessage', () => {
  test('converts user message', () => {
    const msg: ChatMessage = { role: 'user', content: 'hello' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'user', content: 'hello' })
  })

  test('converts assistant message with text', () => {
    const msg: ChatMessage = { role: 'assistant', content: 'response' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'assistant', content: 'response' })
  })

  test('converts assistant message with tool calls', () => {
    const msg: ChatMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'bash', input: { command: 'ls' } }],
    }
    const result = convertMessage(msg)
    expect(result.role).toBe('assistant')
    expect(result.tool_calls).toHaveLength(1)
    expect(result.tool_calls?.[0]).toEqual({
      id: 'call_1',
      type: 'function',
      function: { name: 'bash', arguments: '{"command":"ls"}' },
    })
  })

  test('converts tool result message', () => {
    const msg: ChatMessage = { role: 'tool', content: 'file.txt', toolCallId: 'call_1' }
    const result = convertMessage(msg)
    expect(result).toEqual({ role: 'tool', content: 'file.txt', tool_call_id: 'call_1' })
  })
})

describe('convertTool', () => {
  test('converts tool schema to OpenAI function format', () => {
    const tool: ProviderToolSchema = {
      name: 'bash',
      description: 'Run a bash command',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    }
    const result = convertTool(tool)
    expect(result).toEqual({
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a bash command',
        parameters: tool.inputSchema,
      },
    })
  })
})

function mockFetch(bodies: unknown[], urls?: string[]): typeof globalThis.fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (urls) urls.push(String(url))
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body))
    return {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(successStream()))
          controller.close()
        },
      }),
    } as Response
  }) as typeof globalThis.fetch
}

async function drain(iterable: AsyncIterable<unknown>): Promise<void> {
  for await (const event of iterable) {
    void event
  }
}
