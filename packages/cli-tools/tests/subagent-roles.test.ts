import { describe, expect, test } from 'bun:test'
import type { PermissionMode, ToolContext, ToolRegistry } from '@orchentra/cli-core'
import { resolveSubagentRole, restrictRegistry } from '../src/tools/subagent-roles'

function fakeRegistry(entries: Record<string, PermissionMode>): ToolRegistry {
  return {
    list: () =>
      Object.keys(entries).map((name) => ({ name, description: name, inputSchema: { type: 'object' as const } })),
    requirements: () => entries,
    has: (name) => name in entries,
    execute: async (name) => ({ content: `ran:${name}`, isError: false }),
    register: () => {},
  }
}

const ctx = { sessionId: 't', cwd: '/tmp' } as ToolContext

describe('resolveSubagentRole', () => {
  test('resolves the named roles and defaults to the generic completer when omitted', () => {
    const explorer = resolveSubagentRole('explorer')
    expect(explorer.role?.focus).toContain('read')
    expect(explorer.error).toBeUndefined()

    const generic = resolveSubagentRole(undefined)
    expect(generic.role?.name).toBe('generic')
    expect(generic.role?.focus).toContain('completing a specific sub-task')
  })

  test('rejects an unknown type naming the valid ones', () => {
    const result = resolveSubagentRole('ninja')
    expect(result.role).toBeUndefined()
    expect(result.error).toContain('ninja')
    expect(result.error).toContain('explorer')
    expect(result.error).toContain('reviewer')
    expect(result.error).toContain('builder')
  })
})

describe('restrictRegistry', () => {
  const entries: Record<string, PermissionMode> = {
    read_file: 'read-only',
    grep_search: 'read-only',
    write_file: 'workspace-write',
    bash: 'danger-full-access',
    agent: 'danger-full-access',
  }

  test('explorer sees and runs only read-level tools', async () => {
    const restricted = restrictRegistry(fakeRegistry(entries), resolveSubagentRole('explorer').role!)
    expect(
      restricted
        .list()
        .map((t) => t.name)
        .sort(),
    ).toEqual(['grep_search', 'read_file'])
    expect((await restricted.execute('read_file', {}, ctx)).content).toBe('ran:read_file')
    const refused = await restricted.execute('write_file', {}, ctx)
    expect(refused.isError).toBe(true)
    expect(refused.content).toContain('explorer')
  })

  test('reviewer keeps bash but not write or agent tools', () => {
    const restricted = restrictRegistry(fakeRegistry(entries), resolveSubagentRole('reviewer').role!)
    const names = restricted.list().map((t) => t.name)
    expect(names).toContain('bash')
    expect(names).not.toContain('write_file')
    expect(names).not.toContain('agent')
  })

  test('builder and generic pass the registry through untouched', () => {
    const registry = fakeRegistry(entries)
    expect(restrictRegistry(registry, resolveSubagentRole('builder').role!)).toBe(registry)
    expect(restrictRegistry(registry, resolveSubagentRole(undefined).role!)).toBe(registry)
  })
})
