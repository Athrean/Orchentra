import { describe, expect, test } from 'bun:test'
import { findDuplicateReads, groupToolSources } from '../src/runtime/context-breakdown'
import type { ChatMessage, ProviderToolSchema } from '../src/runtime/provider'

const tool = (name: string): ProviderToolSchema => ({
  name,
  description: `does ${name}`,
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
})

// Deterministic estimator: 1 token per character, so sizes are predictable.
const chars = (s: string): number => s.length
const serverOf = (name: string): string => (name.startsWith('mcp__') ? name.split('__')[1] : 'built-in')

describe('groupToolSources', () => {
  test('groups built-in vs MCP servers and counts tools', () => {
    const sources = groupToolSources(
      [tool('read_file'), tool('mcp__github__list'), tool('mcp__github__get'), tool('bash')],
      serverOf,
      chars,
    )
    const byServer = Object.fromEntries(sources.map((s) => [s.server, s.tools]))
    expect(byServer).toEqual({ 'built-in': 2, github: 2 })
  })

  test('sums each source token cost and sorts by cost descending', () => {
    const sources = groupToolSources([tool('a'), tool('mcp__srv__longlonglongname')], serverOf, chars)
    expect(sources[0].estimatedTokens).toBeGreaterThanOrEqual(sources[1].estimatedTokens)
    // token cost is positive and reflects schema serialization
    expect(sources.every((s) => s.estimatedTokens > 0)).toBe(true)
  })

  test('empty tool list yields no sources', () => {
    expect(groupToolSources([], serverOf, chars)).toEqual([])
  })
})

describe('findDuplicateReads', () => {
  const readCall = (path: string): ChatMessage => ({
    role: 'assistant',
    content: '',
    toolCalls: [{ id: path + Math.random(), name: 'read_file', input: { path } }],
  })

  test('flags a file read more than once, most-repeated first', () => {
    const messages: ChatMessage[] = [
      readCall('a.ts'),
      readCall('a.ts'),
      readCall('a.ts'),
      readCall('b.ts'),
      readCall('b.ts'),
      readCall('c.ts'),
    ]
    expect(findDuplicateReads(messages)).toEqual([
      { path: 'a.ts', reads: 3 },
      { path: 'b.ts', reads: 2 },
    ])
  })

  test('a file read once is not a duplicate', () => {
    expect(findDuplicateReads([readCall('only.ts')])).toEqual([])
  })

  test('ignores non-read tool calls and malformed inputs', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'bash', input: { path: 'x' } }] },
      { role: 'assistant', content: '', toolCalls: [{ id: '2', name: 'read_file', input: { nope: 1 } }] },
      { role: 'user', content: 'hello' },
    ]
    expect(findDuplicateReads(messages)).toEqual([])
  })
})
