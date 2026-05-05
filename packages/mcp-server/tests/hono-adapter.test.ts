import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Operation } from '@orchentra/operations'
import { mountMcpRoutes } from '../src/hono-adapter'

function echoOp(): Operation<{ message: string }, string> {
  return {
    id: 'echo',
    description: 'echoes input',
    scope: 'read',
    localOnly: false,
    mutating: false,
    parameters: z.object({ message: z.string() }),
    handler: async (_ctx, params) => params.message,
  }
}

function authedRequest(path: string, body: unknown): Request {
  return new Request(`https://server.example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
      'x-orchentra-org': 'org_abc',
    },
    body: JSON.stringify(body),
  })
}

describe('mountMcpRoutes', () => {
  test('mounts POST /mcp on the supplied Hono app and routes through handleHttpRpc', async () => {
    const app = new Hono()
    mountMcpRoutes(app, {
      operations: [echoOp() as Operation],
      serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
    })

    const res = await app.fetch(authedRequest('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } }
    expect(body.result.tools[0].name).toBe('echo')
  })

  test('respects auth gate (401 when Authorization missing)', async () => {
    const app = new Hono()
    mountMcpRoutes(app, {
      operations: [echoOp() as Operation],
      serverInfo: { name: 'x', version: '0' },
    })
    const req = new Request('https://server.example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await app.fetch(req)

    expect(res.status).toBe(401)
  })

  test('honors a custom path prefix when provided', async () => {
    const app = new Hono()
    mountMcpRoutes(app, {
      operations: [echoOp() as Operation],
      serverInfo: { name: 'x', version: '0' },
      path: '/api/mcp',
    })

    const okRes = await app.fetch(authedRequest('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    expect(okRes.status).toBe(200)

    const missRes = await app.fetch(authedRequest('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }))
    expect(missRes.status).toBe(404)
  })

  test('GET /mcp/health returns 200 ok for liveness probes', async () => {
    const app = new Hono()
    mountMcpRoutes(app, {
      operations: [echoOp() as Operation],
      serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
    })

    const res = await app.fetch(new Request('https://server.example.com/mcp/health'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; serverInfo: { name: string } }
    expect(body.status).toBe('ok')
    expect(body.serverInfo.name).toBe('orchentra-mcp')
  })
})
