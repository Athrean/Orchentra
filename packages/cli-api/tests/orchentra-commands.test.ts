import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test'
import { postSlashCommand } from '../src/orchentra/commands'

interface CapturedRequest {
  url: string
  init: RequestInit
}

let originalFetch: typeof fetch
let captured: CapturedRequest | null

function makeStreamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function makeJsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  originalFetch = globalThis.fetch
  captured = null
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const chunk of iter) out.push(chunk)
  return out
}

describe('postSlashCommand', () => {
  test('yields decoded text chunks from the response body', async () => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} }
      return makeStreamResponse(['hello ', 'world\n'])
    }) as unknown as typeof fetch

    const chunks = await collect(
      postSlashCommand({
        serverUrl: 'http://localhost:3001',
        orgId: 'org-1',
        apiKey: 'orch_test',
        command: 'status',
        args: [],
        sessionId: 'sess-1',
      }),
    )

    expect(chunks.join('')).toBe('hello world\n')
  })

  test('POSTs to /api/orgs/:orgId/commands with auth header and body', async () => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} }
      return makeStreamResponse([''])
    }) as unknown as typeof fetch

    await collect(
      postSlashCommand({
        serverUrl: 'http://localhost:3001',
        orgId: 'org-42',
        apiKey: 'orch_abc',
        command: 'triage',
        args: ['acme/repo', '12345'],
        sessionId: 'sess-9',
      }),
    )

    expect(captured?.url).toBe('http://localhost:3001/api/orgs/org-42/commands')
    expect(captured?.init.method).toBe('POST')
    const headers = new Headers(captured?.init.headers)
    expect(headers.get('authorization')).toBe('Bearer orch_abc')
    expect(headers.get('content-type')).toBe('application/json')
    const body = JSON.parse(String(captured?.init.body))
    expect(body).toEqual({
      command: 'triage',
      args: ['acme/repo', '12345'],
      sessionId: 'sess-9',
    })
  })

  test('throws a clear error on 401 with server message', async () => {
    globalThis.fetch = mock(async () => makeJsonResponse({ error: 'Invalid API key' }, 401)) as unknown as typeof fetch

    await expect(
      collect(
        postSlashCommand({
          serverUrl: 'http://x',
          orgId: 'o',
          apiKey: 'bad',
          command: 'status',
          args: [],
          sessionId: 's',
        }),
      ),
    ).rejects.toThrow(/401.*Invalid API key/)
  })

  test('strips trailing slash on serverUrl', async () => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} }
      return makeStreamResponse([''])
    }) as unknown as typeof fetch

    await collect(
      postSlashCommand({
        serverUrl: 'http://localhost:3001/',
        orgId: 'o',
        apiKey: 'k',
        command: 'status',
        args: [],
        sessionId: 's',
      }),
    )

    expect(captured?.url).toBe('http://localhost:3001/api/orgs/o/commands')
  })
})
