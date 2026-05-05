import { describe, expect, test } from 'bun:test'
import { buildGraphLayout, formatGraphTree, type GraphLayout, type GraphNode } from '../src/render/graph-tree'

/**
 * Locks the CLAUDE.md §2 Phase 3 verification gate: "ships when
 * `orchentra graph <id>` matches dashboard structure". Both surfaces
 * (CLI `formatGraphTree`, web `GraphView`) consume the same
 * `buildGraphLayout` primitive, so structural drift is only possible if
 * one surface stops using it. This test asserts the structural contract
 * both renderers walk: identical roots, identical child order under each
 * parent, identical depth per node — for a fixture that exercises every
 * branch the renderers care about (multi-root, multi-level, sibling
 * round ordering, orphan parent). Cycle handling is layout-level and is
 * exercised in a separate test on the layout primitive.
 */

function n(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n',
    parentNodeId: null,
    kind: 'tool_call',
    integration: 'github',
    round: 1,
    durationMs: 100,
    createdAt: '2026-04-29T00:00:00Z',
    ...overrides,
  }
}

// Acyclic fixture: two roots (out-of-order rounds), multi-level children
// with sibling-round shuffling, an orphan whose parent is missing.
const FIXTURE: readonly GraphNode[] = [
  n({ id: 'root-b', parentNodeId: null, round: 2 }),
  n({ id: 'root-a', parentNodeId: null, round: 1 }),
  n({ id: 'a-c2', parentNodeId: 'root-a', round: 5 }),
  n({ id: 'a-c1', parentNodeId: 'root-a', round: 2 }),
  n({ id: 'a-c1-gc', parentNodeId: 'a-c1', round: 1 }),
  n({ id: 'b-only-child', parentNodeId: 'root-b', round: 1 }),
  n({ id: 'orphan', parentNodeId: 'missing', round: 9 }),
]

interface Visit {
  readonly id: string
  readonly depth: number
  readonly parentId: string | null
}

/**
 * Mirrors the web `GraphView`/`Subtree` traversal: walk `layout.roots`,
 * then for each node descend `layout.childrenByParent.get(node.id)` and
 * increment depth by 1. Returns the visit order both renderers must agree on.
 */
function walkLikeWeb(layout: GraphLayout): readonly Visit[] {
  const out: Visit[] = []
  const visit = (node: GraphNode, depth: number, parentId: string | null): void => {
    out.push({ id: node.id, depth, parentId })
    const children = layout.childrenByParent.get(node.id) ?? []
    for (const child of children) visit(child, depth + 1, node.id)
  }
  for (const root of layout.roots) visit(root, 0, null)
  return out
}

/**
 * Mirrors the CLI `formatGraphTree` traversal by reading the rendered
 * lines back: each line's leading-whitespace count is its depth, the
 * trailing token is the node id. (formatGraphTree uses 3-char indent per
 * depth level: '   ' or '│  '.)
 */
function walkLikeCli(nodes: readonly GraphNode[]): readonly Pick<Visit, 'id' | 'depth'>[] {
  const lines = formatGraphTree(nodes)
    .split('\n')
    .filter((l) => l.length > 0)
  return lines.map((line) => {
    const id = line
      .trim()
      .split(/\s+/)
      .find((tok) => !/[└├─│]/.test(tok))!
    // formatGraphTree.emit: roots have no branch glyph (depth 0). Every
    // non-root line begins with N copies of '   '/'│  ' (3 chars each)
    // for ancestor levels, then '├─ '/'└─ ' for itself. Depth = ancestor
    // levels + 1.
    const branchIdx = line.search(/[└├]/)
    if (branchIdx === -1) return { id, depth: 0 }
    return { id, depth: branchIdx / 3 + 1 }
  })
}

describe('graph rendering parity (CLI ↔ dashboard)', () => {
  const layout = buildGraphLayout(FIXTURE)

  test('roots agree on identity and order across surfaces', () => {
    // Real roots come first sorted by round (root-a round=1, root-b round=2),
    // then orphans whose parent is missing get promoted to roots in round order.
    expect(layout.roots.map((r) => r.id)).toEqual(['root-a', 'root-b', 'orphan'])
  })

  test('depthByNode is finite for every input node and respects tree levels', () => {
    for (const node of FIXTURE) {
      const d = layout.depthByNode.get(node.id)
      expect(d).toBeDefined()
      expect(Number.isFinite(d!)).toBe(true)
    }
    expect(layout.depthByNode.get('root-a')).toBe(0)
    expect(layout.depthByNode.get('root-b')).toBe(0)
    expect(layout.depthByNode.get('a-c1')).toBe(1)
    expect(layout.depthByNode.get('a-c2')).toBe(1)
    expect(layout.depthByNode.get('a-c1-gc')).toBe(2)
    expect(layout.depthByNode.get('b-only-child')).toBe(1)
    expect(layout.depthByNode.get('orphan')).toBe(0)
  })

  test('child order under each parent is round-sorted (deterministic)', () => {
    expect(layout.childrenByParent.get('root-a')?.map((c) => c.id)).toEqual(['a-c1', 'a-c2'])
    expect(layout.childrenByParent.get('a-c1')?.map((c) => c.id)).toEqual(['a-c1-gc'])
    expect(layout.childrenByParent.get('root-b')?.map((c) => c.id)).toEqual(['b-only-child'])
  })

  test('CLI traversal and web traversal produce identical (id, depth) sequences', () => {
    const webVisits = walkLikeWeb(layout).map(({ id, depth }) => ({ id, depth }))
    const cliVisits = walkLikeCli(FIXTURE)
    expect(cliVisits).toEqual(webVisits)
  })

  test('web-traversal depth at every node equals layout.depthByNode', () => {
    for (const visit of walkLikeWeb(layout)) {
      expect(visit.depth).toBe(layout.depthByNode.get(visit.id)!)
    }
  })

  test('every node visited exactly once by the web traversal', () => {
    const visits = walkLikeWeb(layout)
    const ids = visits.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids).size).toBe(FIXTURE.length)
  })
})

describe('graph layout cycle promotion (layout-level invariant)', () => {
  // Cycle-handling lives in buildGraphLayout, not the renderers. Both
  // current renderers walk childrenByParent unguarded and would loop on
  // a cycle reachable from roots — that's a separate, known limitation.
  // What the layout guarantees is: every node gets a finite depth and
  // appears in roots iff its parent isn't in the input set OR the cycle
  // has no genuine root.
  test('cycle members all get finite depth', () => {
    const layout = buildGraphLayout([
      n({ id: 'cyc-a', parentNodeId: 'cyc-b', round: 7 }),
      n({ id: 'cyc-b', parentNodeId: 'cyc-a', round: 8 }),
    ])
    expect(layout.depthByNode.size).toBe(2)
    expect(Number.isFinite(layout.depthByNode.get('cyc-a')!)).toBe(true)
    expect(Number.isFinite(layout.depthByNode.get('cyc-b')!)).toBe(true)
  })

  test('cycle promotes the lower-round member to a pseudo-root', () => {
    const layout = buildGraphLayout([
      n({ id: 'cyc-a', parentNodeId: 'cyc-b', round: 7 }),
      n({ id: 'cyc-b', parentNodeId: 'cyc-a', round: 8 }),
    ])
    expect(layout.roots.map((r) => r.id)).toEqual(['cyc-a'])
  })
})
