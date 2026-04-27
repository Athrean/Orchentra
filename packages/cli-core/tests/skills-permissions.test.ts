import { describe, expect, test } from 'bun:test'
import { translateAllowedTools } from '../src/runtime/skills/permissions'
import { parseRule } from '../src/runtime/permissions'

describe('translateAllowedTools', () => {
  test('returns empty config for empty input', () => {
    const result = translateAllowedTools([])
    expect(result.config.allow).toEqual([])
    expect(result.config.deny).toEqual([])
    expect(result.config.ask).toEqual([])
    expect(result.warnings).toEqual([])
  })

  test('translates Bash subject patterns to allow rules parseable by parseRule', () => {
    const result = translateAllowedTools(['Bash(kubectl:*)', 'Bash(helm:*)'])
    expect(result.config.allow).toEqual(['Bash(kubectl:*)', 'Bash(helm:*)'])
    expect(result.warnings).toEqual([])

    const parsed = parseRule(result.config.allow[0])
    expect(parsed.toolName).toBe('Bash')
    expect(parsed.matcher).toEqual({ kind: 'prefix', prefix: 'kubectl' })
  })

  test('translates qualified MCP tool names', () => {
    const result = translateAllowedTools(['mcp__terraform__plan', 'mcp__terraform__*'])
    expect(result.config.allow).toEqual(['mcp__terraform__plan', 'mcp__terraform__*'])
  })

  test('skips empty strings with a warning', () => {
    const result = translateAllowedTools(['Bash(kubectl *)', '', '   '])
    expect(result.config.allow).toEqual(['Bash(kubectl *)'])
    expect(result.warnings.length).toBe(2)
    expect(result.warnings[0]).toContain('empty')
  })

  test('produces deny + ask as empty arrays so the result is a valid PermissionRuleConfig', () => {
    const result = translateAllowedTools(['Bash(echo *)'])
    expect(Object.keys(result.config).sort()).toEqual(['allow', 'ask', 'deny'])
  })
})
