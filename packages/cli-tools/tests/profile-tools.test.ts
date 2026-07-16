import { describe, expect, test } from 'bun:test'
import type { ModelProfile } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '../src/tool-registry'
import { applyModelProfile } from '../src/profile-tools'

const base = { match: [/^x-/], provider: 'openai', divergences: [] } as const

const generic: ModelProfile = { ...base, family: 'x' }
const diffDialect: ModelProfile = { ...base, family: 'x', editDialect: 'unified-diff' }
const vocab: ModelProfile = {
  ...base,
  family: 'x',
  toolDescriptions: { read_file: 'Read a file. Always read before patching.' },
}

function names(registry: DefaultToolRegistry): string[] {
  return registry.list().map((t) => t.name)
}

describe('applyModelProfile', () => {
  test('unified-diff dialect swaps edit_file for apply_patch, and back', () => {
    const registry = new DefaultToolRegistry()
    expect(names(registry)).toContain('edit_file')

    applyModelProfile(registry, diffDialect)
    expect(names(registry)).toContain('apply_patch')
    expect(names(registry)).not.toContain('edit_file')

    // Mid-session switch back to a generic-dialect family restores edit_file.
    applyModelProfile(registry, generic)
    expect(names(registry)).toContain('edit_file')
    expect(names(registry)).not.toContain('apply_patch')
  })

  test('description overrides apply and revert on profile change', () => {
    const registry = new DefaultToolRegistry()
    const pristine = registry.list().find((t) => t.name === 'read_file')?.description

    applyModelProfile(registry, vocab)
    expect(registry.list().find((t) => t.name === 'read_file')?.description).toContain('Always read before patching')

    applyModelProfile(registry, generic)
    expect(registry.list().find((t) => t.name === 'read_file')?.description).toBe(pristine)
  })

  test('overriding an unknown tool is a no-op, and execution still works after a swap', async () => {
    const registry = new DefaultToolRegistry()
    applyModelProfile(registry, { ...vocab, toolDescriptions: { no_such_tool: 'x' } })
    expect(registry.has('no_such_tool')).toBe(false)
    applyModelProfile(registry, diffDialect)
    expect(registry.has('apply_patch')).toBe(true)
    expect(registry.requirements()['apply_patch']).toBeDefined()
  })
})
