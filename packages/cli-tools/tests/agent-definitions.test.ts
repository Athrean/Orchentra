import { describe, expect, test } from 'bun:test'
import type { PermissionMode } from '@orchentra/cli-core'
import {
  parseAgentDefinition,
  roleFromDefinition,
  mergeAgentRoles,
  type AgentDefinition,
} from '../src/tools/agent-definitions'

describe('parseAgentDefinition', () => {
  test('reads name, description, tools, model and body from valid frontmatter', () => {
    const text = `---
name: security-auditor
description: Reviews code for auth and injection flaws
tools: read-only
model: opus-4
---
You are a security auditor. Read the code and report vulnerabilities with file paths.`
    const result = parseAgentDefinition(text, '/proj/.orchentra/agents/security.md')
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.definition.name).toBe('security-auditor')
    expect(result.definition.description).toContain('auth')
    expect(result.definition.tools).toBe('read-only')
    expect(result.definition.model).toBe('opus-4')
    expect(result.definition.body).toContain('security auditor')
    expect(result.definition.source).toBe('/proj/.orchentra/agents/security.md')
  })

  test('reads an explicit tool allowlist array', () => {
    const text = `---
name: patcher
description: Applies a narrow fix
tools: [read_file, file_edit, bash]
---
Apply the delegated one-file change.`
    const result = parseAgentDefinition(text, 'x.md')
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.definition.tools).toEqual(['read_file', 'file_edit', 'bash'])
  })

  test('rejects frontmatter with no fence', () => {
    const result = parseAgentDefinition('just a plain body, no frontmatter', 'bad.md')
    expect(result.kind).toBe('error')
  })

  test('rejects a definition missing name', () => {
    const text = `---
description: has a description but no name
---
body`
    const result = parseAgentDefinition(text, 'bad.md')
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.message).toContain('name')
  })

  test('rejects a definition missing description', () => {
    const text = `---
name: nameonly
---
body`
    const result = parseAgentDefinition(text, 'bad.md')
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.message).toContain('description')
  })
})

describe('roleFromDefinition', () => {
  const def = (tools: string | string[]): AgentDefinition => ({
    name: 'r',
    description: 'd',
    tools,
    body: 'You are the r sub-agent.',
    source: 'r.md',
  })

  test('read-only shorthand allows only read-only tools', () => {
    const role = roleFromDefinition(def('read-only'))
    expect(role.allows('read_file', 'read-only' as PermissionMode)).toBe(true)
    expect(role.allows('write_file', 'workspace-write' as PermissionMode)).toBe(false)
    expect(role.allows('bash', 'danger-full-access' as PermissionMode)).toBe(false)
  })

  test('admin shorthand is unrestricted', () => {
    const role = roleFromDefinition(def('admin'))
    expect(role.unrestricted).toBe(true)
    expect(role.allows('anything', 'danger-full-access' as PermissionMode)).toBe(true)
  })

  test('an explicit array allows exactly the listed tools by name', () => {
    const role = roleFromDefinition(def(['read_file', 'bash']))
    expect(role.allows('read_file', 'read-only' as PermissionMode)).toBe(true)
    expect(role.allows('bash', 'danger-full-access' as PermissionMode)).toBe(true)
    expect(role.allows('write_file', 'workspace-write' as PermissionMode)).toBe(false)
  })

  test('the body becomes the role focus/system-prompt', () => {
    const role = roleFromDefinition(def('read-only'))
    expect(role.focus).toContain('r sub-agent')
  })
})

describe('mergeAgentRoles', () => {
  test('keeps the built-in roles when nothing is discovered', () => {
    const merged = mergeAgentRoles([])
    expect(Object.keys(merged).sort()).toEqual(['browser-tester', 'builder', 'explorer', 'reviewer'])
  })

  test('adds a new discovered role alongside the built-ins', () => {
    const merged = mergeAgentRoles([
      { name: 'auditor', description: 'audits', tools: 'read-only', body: 'audit', source: 'a.md' },
    ])
    expect(merged.auditor).toBeDefined()
    expect(merged.auditor!.description).toBe('audits')
    expect(merged.explorer).toBeDefined()
  })

  test('a discovered role sharing a built-in name shadows the built-in', () => {
    const merged = mergeAgentRoles([
      { name: 'explorer', description: 'my custom explorer', tools: 'admin', body: 'go', source: 'e.md' },
    ])
    expect(merged.explorer!.description).toBe('my custom explorer')
    expect(merged.explorer!.unrestricted).toBe(true)
  })
})
