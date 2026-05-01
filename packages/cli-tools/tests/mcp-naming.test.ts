import { describe, expect, test } from 'bun:test'
import { isMcpToolName, mcpToolName, mcpToolPrefix, normalizeNameForMcp } from '../src/mcp/naming'

describe('normalizeNameForMcp', () => {
  test('preserves allowed characters', () => {
    expect(normalizeNameForMcp('github')).toBe('github')
    expect(normalizeNameForMcp('My-Server_1')).toBe('My-Server_1')
  })

  test('replaces disallowed characters with underscore', () => {
    expect(normalizeNameForMcp('github.com')).toBe('github_com')
    expect(normalizeNameForMcp('tool name!')).toBe('tool_name_')
    expect(normalizeNameForMcp('a/b:c')).toBe('a_b_c')
  })

  test('collapses underscores and trims for claude.ai-prefixed server names', () => {
    expect(normalizeNameForMcp('claude.ai Example   Server!!')).toBe('claude_ai_Example_Server')
  })

  test('does not collapse underscores for regular server names', () => {
    expect(normalizeNameForMcp('my  server')).toBe('my__server')
  })
})

describe('mcpToolName', () => {
  test('joins server and tool with mcp__ prefix and __ separator', () => {
    expect(mcpToolName('github', 'create_issue')).toBe('mcp__github__create_issue')
  })

  test('normalizes both server and tool', () => {
    expect(mcpToolName('github.com', 'create issue')).toBe('mcp__github_com__create_issue')
  })

  test('preserves claude.ai server prefix verbatim', () => {
    expect(mcpToolName('claude.ai Example Server', 'weather tool')).toBe('mcp__claude_ai_Example_Server__weather_tool')
  })
})

describe('mcpToolPrefix', () => {
  test('produces the mcp__<server>__ prefix', () => {
    expect(mcpToolPrefix('github')).toBe('mcp__github__')
  })
})

describe('isMcpToolName', () => {
  test('true for correctly prefixed names with at least server and tool', () => {
    expect(isMcpToolName('mcp__github__list_issues')).toBe(true)
  })

  test('false for built-in tool names', () => {
    expect(isMcpToolName('bash')).toBe(false)
    expect(isMcpToolName('read_file')).toBe(false)
  })

  test('false for strings that start with mcp__ but have no tool segment', () => {
    expect(isMcpToolName('mcp__github')).toBe(false)
  })
})
