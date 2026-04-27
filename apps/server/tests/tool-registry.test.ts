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
})
