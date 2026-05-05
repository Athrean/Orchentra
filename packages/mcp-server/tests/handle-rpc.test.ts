import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { type Operation } from '@orchentra/operations'
import { handleRpc } from '../src/handle-rpc'

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

describe('handleRpc', () => {
  test('initialize returns server info and protocol version', async () => {
    const response = await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      { operations: [echoOp()], serverInfo: { name: 'orchentra-mcp', version: '0.1.0' } },
    )
    expect(response).not.toBeNull()
    if (!response) return
    expect('result' in response).toBe(true)
    if ('result' in response) {
      const result = response.result as {
        protocolVersion: string
        serverInfo: { name: string; version: string }
        capabilities: { tools?: unknown }
      }
      expect(result.serverInfo.name).toBe('orchentra-mcp')
      expect(result.protocolVersion).toBe('2025-03-26')
      expect(result.capabilities.tools).toBeDefined()
    }
  })

  test('tools/list returns one tool entry per operation', async () => {
    const response = await handleRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { operations: [echoOp()], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).not.toBeNull()
    if (!response || !('result' in response)) return
    const result = response.result as { tools: Array<{ name: string; description?: string; inputSchema: unknown }> }
    expect(result.tools.length).toBe(1)
    expect(result.tools[0].name).toBe('echo')
    expect(result.tools[0].description).toBe('echoes input')
    expect(result.tools[0].inputSchema).toMatchObject({ type: 'object' })
  })

  test('tools/call dispatches to the matching operation and wraps result as text content', async () => {
    const response = await handleRpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'echo', arguments: { message: 'hello' } },
      },
      { operations: [echoOp()], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).not.toBeNull()
    if (!response || !('result' in response)) return
    const result = response.result as {
      content: Array<{ type: string; text: string }>
      isError?: boolean
    }
    expect(result.isError).toBe(false)
    expect(result.content[0]).toEqual({ type: 'text', text: '"hello"' })
  })

  test('tools/call constructs context with remote: true (regression: trust boundary)', async () => {
    let captured: { remote: boolean } | null = null
    const op: Operation<{ x: number }, number> = {
      id: 'capture_ctx',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ x: z.number() }),
      handler: async (ctx, params) => {
        captured = { remote: ctx.remote }
        return params.x
      },
    }
    await handleRpc(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'capture_ctx', arguments: { x: 5 } } },
      { operations: [op], serverInfo: { name: 'x', version: '0' } },
    )
    expect(captured).toEqual({ remote: true })
  })

  test('tools/call rejects write-scoped op without approval (permission_denied → isError content)', async () => {
    const writeOp: Operation<{ body: string }, void> = {
      id: 'post_thing',
      description: '',
      scope: 'write',
      localOnly: false,
      mutating: true,
      parameters: z.object({ body: z.string() }),
      handler: async () => undefined,
    }
    const response = await handleRpc(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'post_thing', arguments: { body: 'spam' } },
      },
      { operations: [writeOp], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).not.toBeNull()
    if (!response || !('result' in response)) return
    const result = response.result as {
      content: Array<{ type: string; text: string }>
      isError?: boolean
    }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('permission_denied')
  })

  test('tools/call returns method-error for unknown tool', async () => {
    const response = await handleRpc(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'missing', arguments: {} } },
      { operations: [echoOp()], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).not.toBeNull()
    if (!response) return
    expect('error' in response).toBe(true)
    if ('error' in response) {
      expect(response.error.code).toBe(-32602)
    }
  })

  test('unknown method returns -32601', async () => {
    const response = await handleRpc(
      { jsonrpc: '2.0', id: 7, method: 'fictional/method' },
      { operations: [], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).not.toBeNull()
    if (!response || !('error' in response)) return
    expect(response.error.code).toBe(-32601)
  })

  test('tools/call uses fresh ctx per call (regression: cross-request ctx mutation)', async () => {
    // First op mutates the ctx it receives. Second op observes its ctx.
    // If ctx is shared, the second call sees `remote: false` and the trust boundary is bypassed.
    const mutator: Operation<Record<string, never>, void> = {
      id: 'mutate_ctx',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({}),
      handler: async (ctx) => {
        ;(ctx as { remote: boolean }).remote = false
        ctx.allowedScopes.add('admin')
      },
    }
    let observedRemote: boolean | null = null
    let observedScopes: number | null = null
    const observer: Operation<Record<string, never>, void> = {
      id: 'observe_ctx',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({}),
      handler: async (ctx) => {
        observedRemote = ctx.remote
        observedScopes = ctx.allowedScopes.size
      },
    }
    const ops = [mutator, observer]
    const deps = { operations: ops, serverInfo: { name: 'x', version: '0' } }
    await handleRpc(
      { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'mutate_ctx', arguments: {} } },
      deps,
    )
    await handleRpc(
      { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'observe_ctx', arguments: {} } },
      deps,
    )
    expect(observedRemote).toBe(true)
    expect(observedScopes).toBe(3)
  })

  test('notifications (no id) yield no response', async () => {
    const response = await handleRpc(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { operations: [], serverInfo: { name: 'x', version: '0' } },
    )
    expect(response).toBeNull()
  })
})
