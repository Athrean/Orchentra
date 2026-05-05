import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import type { Operation } from '@orchentra/operations'
import { handleHttpRpc } from '../src/http-handler'

const baseDeps = { operations: [], serverInfo: { name: 'orchentra-mcp', version: '0.1.0' } }

function authedRequest(body: unknown): Request {
  return new Request('https://mcp.example.com/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-token',
      'x-orchentra-org': 'org_abc',
    },
    body: JSON.stringify(body),
  })
}

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

describe('handleHttpRpc — auth gate', () => {
  test('returns 401 when Authorization header is missing', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('permission_denied')
    expect(body.message).toMatch(/authorization/i)
  })

  test('returns 401 when Authorization scheme is not Bearer', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('permission_denied')
  })

  test('returns 401 when Bearer token is empty', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(401)
  })
})

describe('handleHttpRpc — org header gate', () => {
  test('returns 400 when x-orchentra-org header is missing', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string; message: string }
    expect(body.code).toBe('invalid_input')
    expect(body.message).toMatch(/x-orchentra-org/i)
  })

  test('returns 400 when x-orchentra-org header is empty', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
        'x-orchentra-org': '   ',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('invalid_input')
  })
})

describe('handleHttpRpc — happy path through handleRpc', () => {
  test('tools/list returns the same JSON-RPC response shape as stdio', async () => {
    const deps = { operations: [echoOp() as Operation], serverInfo: { name: 'x', version: '0' } }
    const res = await handleHttpRpc(authedRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), deps)

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      jsonrpc: string
      id: number
      result: { tools: Array<{ name: string; description?: string; inputSchema: unknown }> }
    }
    expect(body.jsonrpc).toBe('2.0')
    expect(body.id).toBe(1)
    expect(body.result.tools.length).toBe(1)
    expect(body.result.tools[0].name).toBe('echo')
  })

  test('tools/call dispatches the operation and returns isError=false content', async () => {
    const deps = { operations: [echoOp() as Operation], serverInfo: { name: 'x', version: '0' } }
    const res = await handleHttpRpc(
      authedRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'echo', arguments: { message: 'hi' } },
      }),
      deps,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      result: { content: Array<{ type: string; text: string }>; isError?: boolean }
    }
    expect(body.result.isError).toBe(false)
    expect(body.result.content[0]).toEqual({ type: 'text', text: '"hi"' })
  })

  test('returns 400 when the body is not valid JSON', async () => {
    const req = new Request('https://mcp.example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
        'x-orchentra-org': 'org_abc',
      },
      body: '{not json',
    })

    const res = await handleHttpRpc(req, baseDeps)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('invalid_input')
  })

  test('notifications (no id) yield 204 with no body', async () => {
    const res = await handleHttpRpc(authedRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }), baseDeps)

    expect(res.status).toBe(204)
  })
})
