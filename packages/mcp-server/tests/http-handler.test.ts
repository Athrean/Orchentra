import { describe, expect, test } from 'bun:test'
import { handleHttpRpc } from '../src/http-handler'

const baseDeps = { operations: [], serverInfo: { name: 'orchentra-mcp', version: '0.1.0' } }

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
