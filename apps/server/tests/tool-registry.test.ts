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
