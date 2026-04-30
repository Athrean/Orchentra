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

  test('pure removal → a has node not in b', () => {
    const a = [n({ id: 'a1' }), n({ id: 'a2', kind: 'synthesis', round: 2 })]
    const b = [n({ id: 'b1' })]
    const result = diffExecutionGraphs(a, b)
    expect(result.removed).toHaveLength(1)
    expect(result.removed[0]?.id).toBe('a2')
    expect(result.unchanged).toHaveLength(1)
    expect(result.added).toEqual([])
  })

  test('matched alignment but argsJson differs → changed (not unchanged)', () => {
    const a = [n({ id: 'a1', argsJson: '{"q":"first"}' })]
    const b = [n({ id: 'b1', argsJson: '{"q":"second"}' })]
    const result = diffExecutionGraphs(a, b)
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]?.a.argsJson).toBe('{"q":"first"}')
    expect(result.changed[0]?.b.argsJson).toBe('{"q":"second"}')
    expect(result.unchanged).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  test('matched alignment but resultJson differs → changed', () => {
    const a = [n({ id: 'a1', resultJson: '{"status":"ok"}' })]
    const b = [n({ id: 'b1', resultJson: '{"status":"err"}' })]
    const result = diffExecutionGraphs(a, b)
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]?.a.id).toBe('a1')
    expect(result.changed[0]?.b.id).toBe('b1')
    expect(result.unchanged).toEqual([])
  })

  test('structural reorder (same kinds, different parent chain) → add+remove', () => {
    // a: root --child(round 2) where the child is parented under root
    // b: same kinds but the "child" is now a root (no parent)
    // Even though kind/integration/round line up, the parent-chain shape
    // differs, so the moved node should be add+remove, not unchanged.
    const a = [
      n({ id: 'a-root' }),
      n({ id: 'a-child', kind: 'synthesis', round: 2, parentNodeId: 'a-root' }),
    ]
    const b = [n({ id: 'b-root' }), n({ id: 'b-orphan', kind: 'synthesis', round: 2, parentNodeId: null })]
    const result = diffExecutionGraphs(a, b)
    // Roots match, but the moved synthesis node has different parent shape.
    expect(result.removed.map((node) => node.id)).toContain('a-child')
    expect(result.added.map((node) => node.id)).toContain('b-orphan')
    expect(result.unchanged).toHaveLength(1)
    expect(result.unchanged[0]?.a.id).toBe('a-root')
  })
})
