import { describe, expect, test } from 'bun:test'
import { diffExecutionGraphs, type DiffGraphNode } from '../src/render/graph-diff'

function n(overrides: Partial<DiffGraphNode> = {}): DiffGraphNode {
  return {
    id: 'n1',
    parentNodeId: null,
    kind: 'tool_call',
    integration: 'github',
    round: 1,
    durationMs: 100,
    argsJson: null,
    resultJson: null,
    createdAt: '2026-04-29T00:00:00Z',
    ...overrides,
  }
}

describe('diffExecutionGraphs', () => {
  test('identical graphs → all nodes unchanged', () => {
    const a = [n({ id: 'a' }), n({ id: 'b', parentNodeId: 'a' })]
    const b = [n({ id: 'a' }), n({ id: 'b', parentNodeId: 'a' })]
    const result = diffExecutionGraphs(a, b)
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.unchanged).toHaveLength(2)
  })

  test('pure addition → b has node not in a', () => {
    const a = [n({ id: 'a-only' })]
    const b = [n({ id: 'b-only-1' }), n({ id: 'b-only-2', kind: 'synthesis', round: 2 })]
    const result = diffExecutionGraphs(a, b)
    expect(result.added).toHaveLength(1)
    expect(result.removed).toHaveLength(0)
    expect(result.unchanged).toHaveLength(1)
    // b-only-1 matches a-only by (kind, integration, round) and shape (both roots)
    expect(result.unchanged[0]?.a.id).toBe('a-only')
    expect(result.unchanged[0]?.b.id).toBe('b-only-1')
    // b-only-2 is unmatched
    expect(result.added[0]?.id).toBe('b-only-2')
  })
})
