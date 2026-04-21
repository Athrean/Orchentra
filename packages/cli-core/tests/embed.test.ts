import { describe, expect, test } from 'bun:test'
import { embedText } from '../src/memory/embed'
import type { MemoryConfig } from '../src/memory/types'

const baseConfig: MemoryConfig = {
  embeddingModel: 'text-embedding-3-small',
  embeddingBaseUrl: 'https://example.com/v1',
  similarityThreshold: 0.78,
  maxResults: 3,
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): {
  restore: () => void
  calls: Array<{ url: string; headers: Headers }>
} {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; headers: Headers }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: typeof input === 'string' ? input : input.toString(),
      headers: new Headers(init?.headers ?? {}),
    })
    return handler(input, init)
  }) as typeof fetch
  return {
    restore: () => {
      globalThis.fetch = originalFetch
    },
    calls,
  }
}

describe('embedText', () => {
  test('throws when embedding base url is missing', async () => {
    // given — a config with no base URL
    // when — embedText is called
    // then — throws "not configured" error
    await expect(
      embedText('hello', {
        ...baseConfig,
        embeddingBaseUrl: undefined,
      }),
    ).rejects.toThrow(/base URL is not configured/i)
  })

  test('sends authorization header when api key is provided', async () => {
    // given — valid config with API key
    const { restore, calls } = mockFetch(async () => {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      const embedding = await embedText('hello', {
        ...baseConfig,
        embeddingApiKey: 'sk-test',
      })

      // then — sends Authorization header and returns embedding
      expect(embedding).toEqual([0.1, 0.2, 0.3])
      expect(calls[0]?.url).toBe('https://example.com/v1/embeddings')
      expect(calls[0]?.headers.get('Authorization')).toBe('Bearer sk-test')
    } finally {
      restore()
    }
  })

  test('does not send authorization header when api key is absent', async () => {
    // given — valid config WITHOUT API key
    const { restore, calls } = mockFetch(async () => {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      const embedding = await embedText('hello', baseConfig)

      // then — does NOT send Authorization header
      expect(embedding).toEqual([0.1, 0.2])
      expect(calls[0]?.headers.get('Authorization')).toBeNull()
    } finally {
      restore()
    }
  })

  test('throws with status code on non-200 response', async () => {
    // given — API returns non-200 status
    const { restore } = mockFetch(async () => {
      return new Response('bad request', { status: 400, statusText: 'Bad Request' })
    })

    try {
      // when — embedText is called
      // then — throws with status code
      await expect(embedText('hello', baseConfig)).rejects.toThrow(/400/)
    } finally {
      restore()
    }
  })

  test('throws "No embedding returned" when API returns empty data array', async () => {
    // given — API returns valid response but empty data array
    const { restore } = mockFetch(async () => {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      // then — throws "No embedding returned"
      await expect(embedText('hello', baseConfig)).rejects.toThrow(/No embedding returned/)
    } finally {
      restore()
    }
  })

  test('returns the embedding vector from a valid response', async () => {
    // given — API returns valid response with embedding
    const expectedEmbedding = [0.5, 0.6, 0.7, 0.8]
    const { restore } = mockFetch(async () => {
      return new Response(JSON.stringify({ data: [{ embedding: expectedEmbedding }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      const embedding = await embedText('hello', baseConfig)

      // then — returns the embedding vector
      expect(embedding).toEqual(expectedEmbedding)
    } finally {
      restore()
    }
  })

  test('strips trailing slash from base URL and constructs correct endpoint', async () => {
    // given — base URL with trailing slash
    const configWithSlash: MemoryConfig = {
      ...baseConfig,
      embeddingBaseUrl: 'https://example.com/v1/',
    }
    const { restore, calls } = mockFetch(async () => {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      await embedText('hello', configWithSlash)

      // then — strips trailing slash and constructs correct URL
      expect(calls[0]?.url).toBe('https://example.com/v1/embeddings')
    } finally {
      restore()
    }
  })

  test('wires AbortController signal to fetch call', async () => {
    // given — a fetch that captures the signal and responds immediately
    let receivedSignal: AbortSignal | undefined
    const { restore } = mockFetch(async (_input, init) => {
      receivedSignal = init?.signal as AbortSignal | undefined
      // Abort immediately to prove the signal is wired up
      receivedSignal?.addEventListener('abort', () => {}, { once: true })
      return new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    try {
      // when — embedText is called
      await embedText('hello', baseConfig)

      // then — fetch received an AbortSignal
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
    } finally {
      restore()
    }
  })
})
