import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'bun'
import { HttpTransport } from '../src/mcp/transport-http'
import { JSON_RPC_VERSION } from '../src/mcp/protocol'

interface MockServer {
  server: Server
  url: string
  received: Array<{ headers: Record<string, string>; body: unknown }>
}

function startMock(handler: (req: Request, body: unknown) => Response | Promise<Response>): MockServer {
  const received: Array<{ headers: Record<string, string>; body: unknown }> = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => {
        headers[key] = value
      })
      const text = await req.text()
      let body: unknown = null
      try {
        body = text.length > 0 ? JSON.parse(text) : null
      } catch {
        body = text
      }
      received.push({ headers, body })
      return handler(req, body)
    },
  })
  return { server, url: `http://localhost:${server.port}`, received }
}

let mockJson: MockServer
let mockSse: MockServer
let mockBad: MockServer

beforeAll(() => {
  mockJson = startMock((_req, body) => {
    const request = body as { id: number }
    return Response.json({ jsonrpc: JSON_RPC_VERSION, id: request.id, result: { ok: true } })
  })

  mockSse = startMock((_req, body) => {
    const request = body as { id: number }
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': keepalive\n\n'))
        const payload = JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id: request.id, result: { ok: true } })
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  })

  mockBad = startMock(() => new Response('boom', { status: 500 }))
})

afterAll(() => {
  mockJson?.server.stop(true)
  mockSse?.server.stop(true)
  mockBad?.server.stop(true)
})

describe('HttpTransport', () => {
  test('parses a JSON response', async () => {
    const t = new HttpTransport({ url: mockJson.url, headers: { 'X-Test': '1' } })
    await t.start()
    const response = await t.send({ jsonrpc: JSON_RPC_VERSION, id: 1, method: 'ping' }, 2_000)
    expect('result' in response ? response.result : null).toEqual({ ok: true })
    const last = mockJson.received.at(-1)
    expect(last?.headers['x-test']).toBe('1')
    expect(last?.headers['accept']).toContain('text/event-stream')
    await t.close()
  })

  test('parses an SSE response and matches id', async () => {
    const t = new HttpTransport({ url: mockSse.url, headers: {} })
    await t.start()
    const response = await t.send({ jsonrpc: JSON_RPC_VERSION, id: 7, method: 'ping' }, 2_000)
    expect(response.id).toBe(7)
    expect('result' in response ? response.result : null).toEqual({ ok: true })
    await t.close()
  })

  test('throws on HTTP error response', async () => {
    const t = new HttpTransport({ url: mockBad.url, headers: {} })
    await t.start()
    await expect(t.send({ jsonrpc: JSON_RPC_VERSION, id: 1, method: 'ping' }, 2_000)).rejects.toThrow('HTTP 500')
    await t.close()
  })

  test('times out when server is unreachable', async () => {
    const t = new HttpTransport({ url: 'http://127.0.0.1:1', headers: {} })
    await t.start()
    await expect(t.send({ jsonrpc: JSON_RPC_VERSION, id: 1, method: 'ping' }, 150)).rejects.toThrow()
    await t.close()
  })
})
