import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ToolRegistry } from '../src/agent/tool-registry'

describe('ToolRegistry', () => {
  test('register + getTools returns the tool keyed by name', () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'echo',
      permission: 'read',
      description: 'echo input',
      parameters: z.object({ msg: z.string() }),
      execute: async ({ msg }) => ({ echoed: msg }),
    })

    const tools = registry.getTools(new Set(['read', 'write', 'admin']))
    expect(Object.keys(tools)).toEqual(['echo'])
    expect(tools.echo.description).toBe('echo input')
  })

  test('getTools filters by allowed permissions', () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'read_logs',
      permission: 'read',
      description: '',
      parameters: z.object({}),
      execute: async () => null,
    })
    registry.register({
      name: 'create_pr',
      permission: 'admin',
      description: '',
      parameters: z.object({}),
      execute: async () => null,
    })

    const readOnly = registry.getTools(new Set(['read']))
    expect(Object.keys(readOnly)).toEqual(['read_logs'])

    const all = registry.getTools(new Set(['read', 'admin']))
    expect(Object.keys(all).sort()).toEqual(['create_pr', 'read_logs'])
  })

  test('runs pre/post hooks around execute and reports duration', async () => {
    const registry = new ToolRegistry()
    const events: string[] = []
    registry.setHooks({
      pre: ({ name, args }) => {
        events.push(`pre:${name}:${JSON.stringify(args)}`)
      },
      post: ({ name, result, durationMs }) => {
        expect(durationMs).toBeGreaterThanOrEqual(0)
        events.push(`post:${name}:${JSON.stringify(result)}`)
      },
    })
    registry.register({
      name: 'echo',
      permission: 'read',
      description: '',
      parameters: z.object({ msg: z.string() }),
      execute: async ({ msg }) => ({ echoed: msg }),
    })

    const tools = registry.getTools(new Set(['read']))
    const result = await tools.echo.execute!({ msg: 'hi' }, { toolCallId: 't1', messages: [] })

    expect(result).toEqual({ echoed: 'hi' })
    expect(events).toEqual(['pre:echo:{"msg":"hi"}', 'post:echo:{"echoed":"hi"}'])
  })

  test('thrown tool errors return is_error result instead of crashing the loop', async () => {
    const registry = new ToolRegistry()
    const events: string[] = []
    registry.setHooks({
      post: ({ name, error, result }) => {
        events.push(`post:${name}:err=${error instanceof Error ? error.message : 'none'}:res=${JSON.stringify(result)}`)
      },
    })
    registry.register({
      name: 'crash',
      permission: 'read',
      description: '',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('upstream 500')
      },
    })

    const tools = registry.getTools(new Set(['read']))
    const result = (await tools.crash.execute!({}, { toolCallId: 't1', messages: [] })) as {
      isError: true
      error: string
    }

    expect(result.isError).toBe(true)
    expect(result.error).toContain('upstream 500')
    expect(events).toEqual(['post:crash:err=upstream 500:res=undefined'])
  })

  test('register throws when name is already registered', () => {
    const registry = new ToolRegistry()
    const def = {
      name: 'echo',
      permission: 'read' as const,
      description: 'first',
      parameters: z.object({}),
      execute: async () => null,
    }
    registry.register(def)
    expect(() => registry.register({ ...def, description: 'second' })).toThrow(/already registered/)
  })
})
