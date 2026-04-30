import { describe, expect, test } from 'bun:test'
import { buildGraphLayout, type GraphNode } from '../src/render/graph-tree'

function n(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n1',
    parentNodeId: null,
    kind: 'tool_call',
    integration: 'github',
    round: 1,
    durationMs: 100,
    createdAt: '2026-04-29T00:00:00Z',
    ...overrides,
  }
}

describe('buildGraphLayout', () => {
  test('empty input → empty layout', () => {
    const layout = buildGraphLayout([])
    expect(layout.roots).toEqual([])
    expect(layout.nodeById.size).toBe(0)
    expect(layout.childrenByParent.size).toBe(0)
    expect(layout.depthByNode.size).toBe(0)
  })

  test('single root → roots has the node, depth 0, indexed', () => {
    const root = n({ id: 'r' })
    const layout = buildGraphLayout([root])
    expect(layout.roots).toEqual([root])
    expect(layout.nodeById.get('r')).toBe(root)
    expect(layout.depthByNode.get('r')).toBe(0)
  })

  test('parent → child puts child under childrenByParent[parent], depth 1', () => {
    const parent = n({ id: 'p' })
    const child = n({ id: 'c', parentNodeId: 'p' })
    const layout = buildGraphLayout([parent, child])
    expect(layout.roots).toEqual([parent])
    expect(layout.childrenByParent.get('p')).toEqual([child])
    expect(layout.depthByNode.get('c')).toBe(1)
  })

  test('multi-root sorted by round (deterministic)', () => {
    const r2 = n({ id: 'late', round: 5 })
    const r1 = n({ id: 'early', round: 1 })
    const layout = buildGraphLayout([r2, r1])
    expect(layout.roots.map((r) => r.id)).toEqual(['early', 'late'])
  })

  test('children sorted by round under their parent', () => {
    const p = n({ id: 'p' })
    const c2 = n({ id: 'late', parentNodeId: 'p', round: 5 })
    const c1 = n({ id: 'early', parentNodeId: 'p', round: 2 })
    const layout = buildGraphLayout([p, c2, c1])
    expect(layout.childrenByParent.get('p')?.map((c) => c.id)).toEqual(['early', 'late'])
  })

  test('orphan parent → orphan is treated as a root with depth 0', () => {
    const orphan = n({ id: 'o', parentNodeId: 'missing' })
    const layout = buildGraphLayout([orphan])
    expect(layout.roots).toEqual([orphan])
    expect(layout.depthByNode.get('o')).toBe(0)
  })

  test('nodeById contains every input node, regardless of position in tree', () => {
    const nodes = [
      n({ id: 'a' }),
      n({ id: 'b', parentNodeId: 'a' }),
      n({ id: 'c', parentNodeId: 'b' }),
      n({ id: 'd', parentNodeId: 'a' }),
    ]
    const layout = buildGraphLayout(nodes)
    expect(layout.nodeById.size).toBe(4)
    for (const node of nodes) expect(layout.nodeById.get(node.id)).toBe(node)
  })

  test('depthByNode covers every reachable node', () => {
    const layout = buildGraphLayout([
      n({ id: 'a' }),
      n({ id: 'b', parentNodeId: 'a' }),
      n({ id: 'c', parentNodeId: 'b' }),
    ])
    expect(layout.depthByNode.get('a')).toBe(0)
    expect(layout.depthByNode.get('b')).toBe(1)
    expect(layout.depthByNode.get('c')).toBe(2)
  })

  test('cycle (a→b, b→a) does not infinite-loop and assigns finite depths', () => {
    const a = n({ id: 'a', parentNodeId: 'b', round: 1 })
    const b = n({ id: 'b', parentNodeId: 'a', round: 2 })
    // Bound the test on wall-clock to catch hangs even if expectations pass.
    const start = Date.now()
    const layout = buildGraphLayout([a, b])
    expect(Date.now() - start).toBeLessThan(500)
    // Both nodes have a parent in the set, but the cycle means neither can
    // genuinely be a root via parentNodeId === null. The walk must still
    // terminate; every node should have a finite depth.
    expect(layout.depthByNode.size).toBe(2)
    expect(Number.isFinite(layout.depthByNode.get('a')!)).toBe(true)
    expect(Number.isFinite(layout.depthByNode.get('b')!)).toBe(true)
  })
})
