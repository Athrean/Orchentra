import { describe, expect, test } from 'bun:test'
import { buildApp } from '../src/worker'

function authedRequest(path: string, body: unknown): Request {
  return new Request(`https://mcp-host.example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer smoke-token',
      'x-orchentra-org': 'org_smoke',
    },
    body: JSON.stringify(body),
  })
}

describe('mcp-host worker (smoke)', () => {
  test('GET /mcp/health returns 200 ok', async () => {
    const app = buildApp()

    const res = await app.fetch(new Request('https://mcp-host.example.com/mcp/health'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; serverInfo: { name: string; version: string } }
    expect(body.status).toBe('ok')
    expect(body.serverInfo.name).toBe('orchentra-mcp')
  })

  test('POST /mcp tools/list returns the operations array', async () => {
    const app = buildApp()

    const res = await app.fetch(authedRequest('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } }
    // The real operations array from @orchentra/operations is mounted; we just
    // verify the shape and that at least one tool comes through.
    expect(Array.isArray(body.result.tools)).toBe(true)
    expect(body.result.tools.length).toBeGreaterThan(0)
    expect(typeof body.result.tools[0].name).toBe('string')
  })

  test('POST /mcp without auth returns 401', async () => {
    const app = buildApp()
    const req = new Request('https://mcp-host.example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await app.fetch(req)

    expect(res.status).toBe(401)
  })
})
