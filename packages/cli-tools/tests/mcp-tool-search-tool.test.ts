import { describe, expect, test } from 'bun:test'
import type { ToolDefinition } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '../src/tool-registry'
import { buildMcpToolSearchTool, MCP_TOOL_SEARCH_NAME } from '../src/mcp/tool-search-tool'

const ctx = { sessionId: 's', cwd: '/w' }

const tool = (name: string, description: string): ToolDefinition => ({
  name,
  description,
  level: 'read',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({ content: 'called', isError: false }),
})

function fixture(): { catalog: ToolDefinition[]; registry: DefaultToolRegistry } {
  const catalog = [
    tool('mcp__github__create_issue', 'Open a new GitHub issue'),
    tool('mcp__slack__post_message', 'Send a Slack message'),
  ]
  return { catalog, registry: new DefaultToolRegistry([]) }
}

describe('mcp_tool_search tool', () => {
  test('has a stable name and read-only level', () => {
    const { catalog, registry } = fixture()
    const search = buildMcpToolSearchTool({ catalog, registry })
    expect(search.name).toBe(MCP_TOOL_SEARCH_NAME)
    expect(search.level).toBe('read')
  })

  test('registers the matched deferred tools so they become callable', async () => {
    const { catalog, registry } = fixture()
    const search = buildMcpToolSearchTool({ catalog, registry })

    expect(registry.has('mcp__github__create_issue')).toBe(false)
    const result = await search.execute({ query: 'github' }, ctx)

    expect(result.isError).toBe(false)
    expect(registry.has('mcp__github__create_issue')).toBe(true)
    // Non-matching tools stay deferred — the whole point is to not load them all.
    expect(registry.has('mcp__slack__post_message')).toBe(false)
    // The result lists what got loaded so the model knows it can now call it.
    expect(result.content).toContain('mcp__github__create_issue')
    expect(result.content).toContain('Open a new GitHub issue')
  })

  test('reports a clean miss without erroring', async () => {
    const { catalog, registry } = fixture()
    const search = buildMcpToolSearchTool({ catalog, registry })
    const result = await search.execute({ query: 'nothingmatchesthis' }, ctx)
    expect(result.isError).toBe(false)
    expect(result.content.toLowerCase()).toContain('no')
  })

  test('caps results at max_results, loading only the top matches', async () => {
    const { catalog, registry } = fixture()
    const search = buildMcpToolSearchTool({ catalog, registry })
    await search.execute({ query: 'message issue', max_results: 1 }, ctx)
    // Exactly one of the two candidates should have been registered.
    const loaded = ['mcp__github__create_issue', 'mcp__slack__post_message'].filter((n) => registry.has(n))
    expect(loaded).toHaveLength(1)
  })

  test('treats a missing query as a browse of the catalog', async () => {
    const { catalog, registry } = fixture()
    const search = buildMcpToolSearchTool({ catalog, registry })
    const result = await search.execute({}, ctx)
    expect(result.isError).toBe(false)
    expect(result.content).toContain('mcp__github__create_issue')
  })
})
