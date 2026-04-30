import { describe, expect, test } from 'bun:test'
import { formatGraphTree, formatNodeLineage, type GraphNode } from '../src/render/graph-tree'

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

describe('formatGraphTree', () => {
  test('empty nodes → empty string', () => {
    expect(formatGraphTree([])).toBe('')
  })

  test('single root → one labelled line', () => {
    const out = formatGraphTree([n({ id: 'a', kind: 'tool_call', integration: 'github' })])
    expect(out).toContain('tool_call')
    expect(out).toContain('github')
    expect(out).toContain('a')
  })

  test('parent → child renders indented under parent', () => {
    const nodes = [n({ id: 'p', parentNodeId: null }), n({ id: 'c', parentNodeId: 'p' })]
    const out = formatGraphTree(nodes)
    const lines = out.split('\n')
    expect(lines[0]).toContain('p')
    expect(lines[1]).toContain('c')
    expect(lines[1]).toMatch(/[└├]/)
  })

  test('multiple children → all but last use ├─, last uses └─', () => {
    const nodes = [
      n({ id: 'p', parentNodeId: null }),
      n({ id: 'c1', parentNodeId: 'p', round: 1 }),
      n({ id: 'c2', parentNodeId: 'p', round: 2 }),
      n({ id: 'c3', parentNodeId: 'p', round: 3 }),
    ]
    const out = formatGraphTree(nodes)
    expect(out).toContain('├─')
    expect(out).toContain('└─')
    // c3 (last) gets └─; c1 and c2 get ├─
    const c3Line = out.split('\n').find((l) => l.includes('c3'))!
    expect(c3Line).toContain('└─')
  })

  test('grandchild renders with continuation prefix', () => {
    const nodes = [
      n({ id: 'p', parentNodeId: null }),
      n({ id: 'c', parentNodeId: 'p' }),
      n({ id: 'gc', parentNodeId: 'c' }),
    ]
    const out = formatGraphTree(nodes)
    const gcLine = out.split('\n').find((l) => l.includes('gc'))!
    // grandchild should be indented more than child
    const cLine = out.split('\n').find((l) => l.includes('c '))!
    expect(gcLine.length).toBeGreaterThan(cLine.length)
  })

  test('orphan node (parent not in set) treated as root', () => {
    const nodes = [n({ id: 'orphan', parentNodeId: 'missing' })]
    const out = formatGraphTree(nodes)
    expect(out).toContain('orphan')
  })

  test('multiple roots — both rendered at top level', () => {
    const out = formatGraphTree([
      n({ id: 'r1', parentNodeId: null, round: 1 }),
      n({ id: 'r2', parentNodeId: null, round: 2 }),
    ])
    expect(out).toContain('r1')
    expect(out).toContain('r2')
  })

  test('children sorted by round (deterministic)', () => {
    const out = formatGraphTree([
      n({ id: 'p', parentNodeId: null }),
      n({ id: 'late', parentNodeId: 'p', round: 5 }),
      n({ id: 'early', parentNodeId: 'p', round: 2 }),
    ])
    const lines = out.split('\n')
    const earlyIdx = lines.findIndex((l) => l.includes('early'))
    const lateIdx = lines.findIndex((l) => l.includes('late'))
    expect(earlyIdx).toBeLessThan(lateIdx)
  })

  test('renders durationMs in compact form', () => {
    expect(formatGraphTree([n({ id: 'a', durationMs: 250 })])).toContain('250ms')
    expect(formatGraphTree([n({ id: 'a', durationMs: 1500 })])).toContain('1.5s')
  })

  test('omits duration when null', () => {
    expect(formatGraphTree([n({ id: 'a', durationMs: null })])).not.toContain('null')
  })
})

describe('formatNodeLineage', () => {
  test('leaf node with no ancestors → renders single node', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf' }),
      ancestors: [],
    })
    expect(out).toContain('leaf')
  })

  test('lineage renders ancestors root → leaf', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf', parentNodeId: 'mid' }),
      ancestors: [n({ id: 'root', parentNodeId: null }), n({ id: 'mid', parentNodeId: 'root' })],
    })
    const rootIdx = out.indexOf('root')
    const midIdx = out.indexOf('mid')
    const leafIdx = out.indexOf('leaf')
    expect(rootIdx).toBeGreaterThan(-1)
    expect(midIdx).toBeGreaterThan(rootIdx)
    expect(leafIdx).toBeGreaterThan(midIdx)
  })

  test('renders argsJson under "inputs" header when provided', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf' }),
      ancestors: [],
      argsJson: '{"reason":"alert was triaged after timeout"}',
    })
    expect(out).toMatch(/inputs/i)
    expect(out).toContain('alert was triaged after timeout')
  })

  test('renders resultJson under "outcome" header when provided', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf' }),
      ancestors: [],
      resultJson: '{"status":"resolved"}',
    })
    expect(out).toMatch(/outcome/i)
    expect(out).toContain('resolved')
  })

  test('skips inputs/outcome sections when JSON missing', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf' }),
      ancestors: [],
    })
    expect(out).not.toMatch(/inputs/i)
    expect(out).not.toMatch(/outcome/i)
  })

  test('handles malformed JSON gracefully (renders raw)', () => {
    const out = formatNodeLineage({
      node: n({ id: 'leaf' }),
      ancestors: [],
      argsJson: 'not json',
    })
    expect(out).toContain('not json')
  })
})
