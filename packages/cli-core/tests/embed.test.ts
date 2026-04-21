import { describe, expect, test } from 'bun:test'
import { embedText } from '../src/memory/embed'
import type { MemoryConfig } from '../src/memory/types'

const baseConfig: MemoryConfig = {
  embeddingModel: 'text-embedding-3-small',
  embeddingBaseUrl: 'https://example.com/v1',
  similarityThreshold: 0.78,
  maxResults: 3,
}

describe('embedText', () => {
  test('throws when embedding base url is missing', async () => {
    await expect(
      embedText('hello', {
        ...baseConfig,
        embeddingBaseUrl: undefined,
      }),
    ).rejects.toThrow(/base URL is not configured/i)
  })

  test('sends authorization header when api key is provided', async () => {
    const calls: Array<{ url: string; headers: Headers }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        url: typeof input === 'string' ? input : input.toString(),
        headers: new Headers(init?.headers ?? {}),
      })
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const embedding = await embedText('hello', {
        ...baseConfig,
        embeddingApiKey: 'sk-test',
      })
      expect(embedding).toEqual([0.1, 0.2, 0.3])
      expect(calls[0]?.url).toBe('https://example.com/v1/embeddings')
      expect(calls[0]?.headers.get('Authorization')).toBe('Bearer sk-test')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

