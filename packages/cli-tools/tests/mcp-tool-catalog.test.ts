import { describe, expect, test } from 'bun:test'
import type { ToolDefinition } from '@orchentra/cli-core'
import { searchCatalog, totalSchemaTokens } from '../src/mcp/tool-catalog'

const tool = (name: string, description: string): ToolDefinition => ({
  name,
  description,
  level: 'read',
  inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  execute: async () => ({ content: '', isError: false }),
})

const catalog: ToolDefinition[] = [
  tool('mcp__github__create_issue', 'Open a new GitHub issue in a repository'),
  tool('mcp__github__list_pulls', 'List open pull requests for a repo'),
  tool('mcp__slack__post_message', 'Send a message to a Slack channel'),
  tool('mcp__linear__create_ticket', 'Create a Linear ticket for tracking work'),
]

// 1 token per character keeps the arithmetic checkable.
const chars = (s: string): number => s.length

describe('searchCatalog', () => {
  test('ranks name matches above description-only matches', () => {
    const hits = searchCatalog(catalog, 'github', 5)
    // Both github tools have "github" in the name; the slack/linear tools do not.
    expect(hits.map((t) => t.name)).toEqual(['mcp__github__create_issue', 'mcp__github__list_pulls'])
  })

  test('matches words in the description when the name does not contain them', () => {
    const hits = searchCatalog(catalog, 'channel', 5)
    expect(hits.map((t) => t.name)).toEqual(['mcp__slack__post_message'])
  })

  test('scores multi-term queries additively and sorts by relevance', () => {
    // "create" hits two names; "ticket" additionally hits linear's name+description,
    // so linear must rank ahead of github's create_issue.
    const hits = searchCatalog(catalog, 'create ticket', 5)
    expect(hits[0].name).toBe('mcp__linear__create_ticket')
    expect(hits.map((t) => t.name)).toContain('mcp__github__create_issue')
  })

  test('honours the result limit, keeping the most relevant', () => {
    expect(searchCatalog(catalog, 'create', 1)).toHaveLength(1)
  })

  test('an empty query returns a name-sorted browse slice up to the limit', () => {
    const hits = searchCatalog(catalog, '   ', 2)
    expect(hits.map((t) => t.name)).toEqual(['mcp__github__create_issue', 'mcp__github__list_pulls'])
  })

  test('returns nothing when no tool matches', () => {
    expect(searchCatalog(catalog, 'nonexistentxyz', 5)).toEqual([])
  })
})

describe('totalSchemaTokens', () => {
  test('sums the serialized schema cost of every tool', () => {
    const one = totalSchemaTokens([catalog[0]], chars)
    const two = totalSchemaTokens([catalog[0], catalog[1]], chars)
    expect(one).toBeGreaterThan(0)
    expect(two).toBeGreaterThan(one)
  })

  test('an empty catalog costs nothing', () => {
    expect(totalSchemaTokens([], chars)).toBe(0)
  })
})
