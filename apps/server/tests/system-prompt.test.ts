import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ToolRegistry } from '../src/agent/tool-registry'
import { buildAgentSystemPrompt, renderToolCatalog } from '../src/agent/prompts'

function fixtureRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name: 'get_workflow_logs',
    permission: 'read',
    description: 'Fetch the last 300 lines of the failed job logs.',
    parameters: z.object({
      owner: z.string(),
      repo: z.string(),
      runId: z.number(),
    }),
    execute: async () => ({}),
  })
  registry.register({
    name: 'search_code',
    permission: 'read',
    description: 'Search for code in the repository.',
    parameters: z.object({
      owner: z.string(),
      repo: z.string(),
      query: z.string(),
      limit: z.number().optional(),
    }),
    execute: async () => ({}),
  })
  registry.register({
    name: 'post_comment',
    permission: 'write',
    description: 'Post a follow-up comment on a pull request.',
    parameters: z.object({
      prNumber: z.number(),
      body: z.string(),
      kind: z.enum(['progress', 'final', 'note']),
    }),
    execute: async () => ({}),
  })
  return registry
}

describe('renderToolCatalog', () => {
  test('lists tools with name, args summary, and description', () => {
    const out = renderToolCatalog(fixtureRegistry(), new Set(['read', 'write']))
    expect(out).toBe(
      [
        'Available tools:',
        '- get_workflow_logs(owner: string, repo: string, runId: number): Fetch the last 300 lines of the failed job logs.',
        '- search_code(owner: string, repo: string, query: string, limit?: number): Search for code in the repository.',
        '- post_comment(prNumber: number, body: string, kind: progress|final|note): Post a follow-up comment on a pull request.',
      ].join('\n'),
    )
  })

  test('filters by allowed permissions', () => {
    const readOnly = renderToolCatalog(fixtureRegistry(), new Set(['read']))
    expect(readOnly).toContain('get_workflow_logs')
    expect(readOnly).toContain('search_code')
    expect(readOnly).not.toContain('post_comment')
  })

  test('renders a placeholder when no tools match', () => {
    const empty = new ToolRegistry()
    expect(renderToolCatalog(empty, new Set(['read']))).toBe('Available tools:\n(none)')
  })
})

describe('buildAgentSystemPrompt', () => {
  test('matches snapshot for the fixture registry (read + write)', () => {
    const prompt = buildAgentSystemPrompt({
      registry: fixtureRegistry(),
      permissions: new Set(['read', 'write']),
    })
    expect(prompt).toMatchSnapshot()
  })

  test('cacheable head and tail are byte-stable across calls', () => {
    const a = buildAgentSystemPrompt({ registry: fixtureRegistry(), permissions: new Set(['read', 'write']) })
    const b = buildAgentSystemPrompt({ registry: fixtureRegistry(), permissions: new Set(['read', 'write']) })
    expect(a).toBe(b)
  })

  test('catalog content changes when registry membership changes; head and tail do not', () => {
    const reg1 = fixtureRegistry()
    const reg2 = fixtureRegistry()
    reg2.register({
      name: 'get_issue',
      permission: 'read',
      description: 'Fetch issue.',
      parameters: z.object({ owner: z.string(), repo: z.string(), number: z.number() }),
      execute: async () => ({}),
    })

    const a = buildAgentSystemPrompt({ registry: reg1, permissions: new Set(['read', 'write']) })
    const b = buildAgentSystemPrompt({ registry: reg2, permissions: new Set(['read', 'write']) })

    expect(a).not.toBe(b)
    expect(b).toContain('get_issue')

    // Head is identical
    const headEnd = a.indexOf('Available tools:')
    expect(a.slice(0, headEnd)).toBe(b.slice(0, headEnd))

    // Tail is identical
    const tailA = a.slice(a.indexOf('Tool calling strategy:'))
    const tailB = b.slice(b.indexOf('Tool calling strategy:'))
    expect(tailA).toBe(tailB)
  })

  test('defaults to all permissions when none are specified', () => {
    const prompt = buildAgentSystemPrompt({ registry: fixtureRegistry() })
    expect(prompt).toContain('post_comment')
    expect(prompt).toContain('get_workflow_logs')
  })
})
