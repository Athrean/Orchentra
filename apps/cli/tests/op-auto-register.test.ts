import { describe, expect, test } from 'bun:test'
import { operations } from '@orchentra/operations'
import { parseArgs } from '../src/args'
import { CommandRegistry } from '../src/commands/registry'
import { registerAllOpsAsSlash } from '../src/op-commands/wire'
import { knownOpIds } from '../src/op-commands/run-op-verb'

describe('parseArgs op-verb dispatch', () => {
  test('every op id parses as kind=op with the rest of argv preserved', () => {
    for (const op of operations) {
      const action = parseArgs(['bun', 'orchentra', op.id, '--owner', 'foo', '--repo', 'bar'])
      expect(action.kind).toBe('op')
      if (action.kind !== 'op') return
      expect(action.opId).toBe(op.id)
      expect(action.argv).toEqual(['--owner', 'foo', '--repo', 'bar'])
    }
  })
})

describe('run-op-verb registry coverage', () => {
  test('knownOpIds covers every op in the registry', () => {
    const ids = new Set(operations.map((op) => op.id))
    for (const id of knownOpIds()) {
      expect(ids.has(id)).toBe(true)
    }
    expect(knownOpIds().size).toBe(operations.length)
  })
})

describe('registerAllOpsAsSlash', () => {
  test('every op is resolvable as /<op_id> through CommandRegistry', () => {
    const registry = new CommandRegistry()
    registerAllOpsAsSlash(registry)
    for (const op of operations) {
      const resolved = registry.resolve(`/${op.id}`)
      expect(resolved).not.toBeNull()
      expect(resolved).not.toBeInstanceOf(Error)
    }
  })

  test('throws when an op id collides with a builtin command name', () => {
    const registry = new CommandRegistry()
    registry.register({
      spec: { name: 'get_pull_request', aliases: [], summary: 'fake builtin' },
      execute: async () => true,
    })
    expect(() => registerAllOpsAsSlash(registry)).toThrow(/collision|already/i)
  })
})
