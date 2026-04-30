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
})
