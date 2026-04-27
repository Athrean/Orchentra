import { describe, expect, mock, test } from 'bun:test'

mock.module('../src/config', () => ({
  config: { github: { token: 'ghp_test', webhook_secret: 'secret', repos: [] } },
}))

const { ToolRegistry } = await import('../src/agent/tool-registry')
const { registerBuiltinTools } = await import('../src/agent/tools/builtin')

describe('registerBuiltinTools', () => {
  test('registers the six read-only investigation tools', () => {
    const registry = new ToolRegistry()
    registerBuiltinTools(registry)
    const tools = registry.getTools(new Set(['read']))
    expect(Object.keys(tools).sort()).toEqual([
      'get_commit_changes',
      'get_file_content',
      'get_issue',
      'get_pull_request',
      'get_workflow_logs',
      'search_code',
    ])
  })

  test('returns nothing when only admin permission is allowed', () => {
    const registry = new ToolRegistry()
    registerBuiltinTools(registry)
    const tools = registry.getTools(new Set(['admin']))
    expect(Object.keys(tools)).toEqual([])
  })
})
