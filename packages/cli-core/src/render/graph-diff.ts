import { buildGraphLayout, type GraphLayout, type GraphNode } from './graph-tree'

export interface DiffGraphNode extends GraphNode {
  readonly argsJson?: string | null
  readonly resultJson?: string | null
}

export interface ChangedDiffEntry {
  readonly a: DiffGraphNode
  readonly b: DiffGraphNode
}

export interface UnchangedDiffEntry {
  readonly a: DiffGraphNode
  readonly b: DiffGraphNode
}

export interface ExecutionGraphDiff {
  readonly added: readonly DiffGraphNode[]
  readonly removed: readonly DiffGraphNode[]
  readonly changed: readonly ChangedDiffEntry[]
  readonly unchanged: readonly UnchangedDiffEntry[]
}

/**
 * Pure, deterministic diff between two execution graphs.
 *
 * Alignment is greedy by `(kind, integration, round)` plus parent-chain shape:
 * a node in `a` matches the first available node in `b` whose alignment key
 * matches. Kind/integration mismatch is treated as add+remove, never as
 * `changed`. Once aligned, we compare `argsJson` / `resultJson` to decide
 * whether the pair is `changed` or `unchanged`.
 */
export function diffExecutionGraphs(
  a: readonly DiffGraphNode[],
  b: readonly DiffGraphNode[],
): ExecutionGraphDiff {
  const layoutA = buildGraphLayout(a)
  const layoutB = buildGraphLayout(b)

  const keysA = new Map<string, string>()
  const keysB = new Map<string, string>()
  for (const node of a) keysA.set(node.id, alignmentKey(node, layoutA))
  for (const node of b) keysB.set(node.id, alignmentKey(node, layoutB))

  // Bucket b's nodes by alignment key in input order so greedy matching pulls
  // the "first available" match deterministically.
  const bByKey = new Map<string, DiffGraphNode[]>()
  for (const node of b) {
    const key = keysB.get(node.id)!
    const bucket = bByKey.get(key) ?? []
    bucket.push(node)
    bByKey.set(key, bucket)
  }

  const matched = new Set<string>()
  const added: DiffGraphNode[] = []
  const removed: DiffGraphNode[] = []
  const changed: ChangedDiffEntry[] = []
  const unchanged: UnchangedDiffEntry[] = []

  for (const nodeA of a) {
    const key = keysA.get(nodeA.id)!
    const bucket = bByKey.get(key)
    const partner = bucket?.shift()
    if (!partner) {
      removed.push(nodeA)
      continue
    }
    matched.add(partner.id)
    if (nodesEqual(nodeA, partner)) {
      unchanged.push({ a: nodeA, b: partner })
    } else {
      changed.push({ a: nodeA, b: partner })
    }
  }

  for (const nodeB of b) {
    if (!matched.has(nodeB.id)) added.push(nodeB)
  }

  return { added, removed, changed, unchanged }
}

function alignmentKey(node: DiffGraphNode, layout: GraphLayout): string {
  // Parent-chain shape: walk up to the root, recording (kind|integration|round)
  // at each level. Bounded by depth to avoid pathological cycles.
  const chain: string[] = []
  let current: GraphNode | undefined = node
  let safety = 64
  while (current && safety-- > 0) {
    chain.push(`${current.kind}|${current.integration}|${current.round}`)
    if (current.parentNodeId == null) break
    const next: GraphNode | undefined = layout.nodeById.get(current.parentNodeId)
    if (!next || next.id === current.id) break
    current = next
  }
  return chain.join('>')
}

function nodesEqual(a: DiffGraphNode, b: DiffGraphNode): boolean {
  return normalize(a.argsJson) === normalize(b.argsJson) && normalize(a.resultJson) === normalize(b.resultJson)
}

function normalize(raw: string | null | undefined): string {
  if (raw == null) return ''
  return raw
}
