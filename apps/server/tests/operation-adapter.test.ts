import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { dispatch, type Operation } from '@orchentra/operations'
import { ToolRegistry } from '../src/agent/tool-registry'

afterEach(() => {})

describe('ToolRegistry.registerOperation', () => {
  test('exposes an Operation as a ToolDefinition the in-process loop can run', async () => {
    const op: Operation<{ name: string }, { hello: string }> = {
      id: 'mock_greet',
      description: 'greets caller',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ name: z.string() }),
      handler: async (_ctx, params) => ({ hello: params.name }),
    }

    const registry = new ToolRegistry()
    registry.registerOperation(op)

    const defs = registry.listDefinitions(new Set(['read']))
    expect(defs.map((d) => d.name)).toEqual(['mock_greet'])
    expect(defs[0].permission).toBe('read')

    const tools = registry.getTools(new Set(['read']))
    const result = await tools.mock_greet.execute!({ name: 'world' }, { toolCallId: 't', messages: [] })
    expect(result).toEqual({ hello: 'world' })
  })

  test('write-scoped operation exposed as write permission', () => {
    const op: Operation<Record<string, never>, void> = {
      id: 'mock_write',
      description: '',
      scope: 'write',
      localOnly: false,
      mutating: true,
      parameters: z.object({}),
      handler: async () => undefined,
    }
    const registry = new ToolRegistry()
    registry.registerOperation(op)
    const defs = registry.listDefinitions(new Set(['write']))
    expect(defs.map((d) => d.permission)).toEqual(['write'])
  })

  test('handler runs through the shared dispatch path (validates params)', async () => {
    const op: Operation<{ count: number }, number> = {
      id: 'mock_count',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ count: z.number() }),
      handler: async (_ctx, params) => params.count * 2,
    }
    const registry = new ToolRegistry()
    registry.registerOperation(op)
    const tools = registry.getTools(new Set(['read']))
    // Adapter must funnel through dispatch (which validates input).
    const bad = (await tools.mock_count.execute!(
      { count: 'oops' as unknown as number },
      {
        toolCallId: 't',
        messages: [],
      },
    )) as { isError: true; error: string }
    expect(bad.isError).toBe(true)
    expect(bad.error).toContain('invalid parameters')
  })

  test('exposes the same dispatch behavior for direct callers (regression: agent loop and external transports must converge)', async () => {
    const op: Operation<{ a: number; b: number }, number> = {
      id: 'mock_add',
      description: '',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ a: z.number(), b: z.number() }),
      handler: async (_ctx, params) => params.a + params.b,
    }
    const registry = new ToolRegistry()
    registry.registerOperation(op)
    const tools = registry.getTools(new Set(['read']))
    const viaTool = await tools.mock_add.execute!({ a: 2, b: 3 }, { toolCallId: 't', messages: [] })
    const viaDispatch = await dispatch(op, { remote: false, allowedScopes: new Set(['read']) }, { a: 2, b: 3 })
    expect(viaTool).toBe(viaDispatch)
  })
})
