import { describe, expect, test } from 'bun:test'
import { validateSkillFrontmatter } from '../src/runtime/skills/validator'

describe('validateSkillFrontmatter', () => {
  test('accepts minimal valid frontmatter', () => {
    const result = validateSkillFrontmatter({ name: 'hello', description: 'say hi' })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.value.name).toBe('hello')
    expect(result.value.description).toBe('say hi')
    expect(result.value.allowedTools).toEqual([])
    expect(result.value.argumentNames).toEqual([])
  })

  test('rejects missing name', () => {
    const result = validateSkillFrontmatter({ description: 'd' })
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.field).toBe('name')
    expect(result.message).toContain('required')
  })

  test('rejects missing description', () => {
    const result = validateSkillFrontmatter({ name: 'hello' })
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.field).toBe('description')
  })

  test('rejects non-string name', () => {
    const result = validateSkillFrontmatter({ name: 42, description: 'd' })
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.field).toBe('name')
    expect(result.message).toContain('string')
  })

  test('parses allowed-tools array of strings', () => {
    const result = validateSkillFrontmatter({
      name: 'deploy',
      description: 'd',
      'allowed-tools': ['Bash(kubectl *)', 'mcp__terraform__*'],
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.value.allowedTools).toEqual(['Bash(kubectl *)', 'mcp__terraform__*'])
  })

  test('rejects allowed-tools with non-string entries', () => {
    const result = validateSkillFrontmatter({
      name: 'deploy',
      description: 'd',
      'allowed-tools': ['Bash(kubectl *)', 42],
    })
    expect(result.kind).toBe('error')
    if (result.kind !== 'error') return
    expect(result.field).toBe('allowed-tools')
  })

  test('parses arguments as string[]', () => {
    const result = validateSkillFrontmatter({
      name: 'deploy',
      description: 'd',
      arguments: ['service', 'environment'],
    })
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.value.argumentNames).toEqual(['service', 'environment'])
  })
})
