import { describe, expect, test } from 'bun:test'
import { createBuiltinRegistry } from '../src/commands/builtin'

describe('builtin registry includes server-bridge commands', () => {
  const registry = createBuiltinRegistry()
  const specs = registry.allSpecs()
  const names = new Set(specs.map((s) => s.name))

  test.each([
    ['incidents', '<filters>'],
    ['triage', '<id|owner/repo> [run-id]'],
    ['retry', '<id>'],
    ['explain', '<id>'],
  ])('exposes /%s with arg hint %s', (name, hint) => {
    expect(names.has(name)).toBe(true)
    const spec = specs.find((s) => s.name === name)!
    expect(spec.argumentHint).toBe(hint)
  })

  test('/status remains the local session-info command (not collided)', () => {
    const resolved = registry.resolve('/status')
    expect(resolved).not.toBeNull()
    if (!resolved || resolved instanceof Error) throw new Error('expected handler')
    expect(resolved.handler.spec.summary).toMatch(/session/i)
  })
})
