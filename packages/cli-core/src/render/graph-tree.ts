export interface GraphNode {
  readonly id: string
  readonly parentNodeId: string | null
  readonly kind: string
  readonly integration: string
  readonly round: number
  readonly durationMs: number | null
  readonly createdAt: string | Date
}

export interface FormatNodeLineageOptions {
  readonly node: GraphNode
  readonly ancestors: readonly GraphNode[]
  readonly argsJson?: string | null
  readonly resultJson?: string | null
}

export interface GraphLayout {
  readonly roots: readonly GraphNode[]
  readonly childrenByParent: ReadonlyMap<string, readonly GraphNode[]>
  readonly nodeById: ReadonlyMap<string, GraphNode>
  readonly depthByNode: ReadonlyMap<string, number>
}

export function buildGraphLayout(nodes: readonly GraphNode[]): GraphLayout {
  const nodeById = new Map<string, GraphNode>()
  const depthByNode = new Map<string, number>()
  const childrenByParent = new Map<string, GraphNode[]>()
  const roots: GraphNode[] = []

  for (const node of nodes) nodeById.set(node.id, node)

  for (const node of nodes) {
    const isRoot = node.parentNodeId === null || !nodeById.has(node.parentNodeId)
    if (isRoot) {
      roots.push(node)
    } else {
      const arr = childrenByParent.get(node.parentNodeId!) ?? []
      arr.push(node)
      childrenByParent.set(node.parentNodeId!, arr)
    }
  }

  roots.sort((a, b) => a.round - b.round)
  Array.from(childrenByParent.values()).forEach((arr) => arr.sort((a, b) => a.round - b.round))

  const seen = new Set<string>()
  for (const root of roots) assignDepth(root, 0, childrenByParent, depthByNode, seen)

  // Cyclic components (nodes whose parent is in the set but the cycle has no
  // real root) are not reachable from `roots`. Promote any unseen node — in
  // round order — to a pseudo-root and walk; the seen-set guards termination.
  const unseen = nodes.filter((node) => !seen.has(node.id)).sort((a, b) => a.round - b.round)
  for (const node of unseen) {
    if (seen.has(node.id)) continue
    roots.push(node)
    assignDepth(node, 0, childrenByParent, depthByNode, seen)
  }

  return { roots, childrenByParent, nodeById, depthByNode }
}

function assignDepth(
  node: GraphNode,
  depth: number,
  childrenByParent: Map<string, GraphNode[]>,
  depthByNode: Map<string, number>,
  seen: Set<string>,
): void {
  if (seen.has(node.id)) return
  seen.add(node.id)
  depthByNode.set(node.id, depth)
  const children = childrenByParent.get(node.id) ?? []
  for (const child of children) assignDepth(child, depth + 1, childrenByParent, depthByNode, seen)
}

export function formatGraphTree(nodes: readonly GraphNode[]): string {
  if (nodes.length === 0) return ''
  const layout = buildGraphLayout(nodes)
  const lines: string[] = []
  for (const root of layout.roots) emit(root, '', true, true, lines, layout.childrenByParent)
  return lines.join('\n')
}

function emit(
  node: GraphNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  out: string[],
  childrenByParent: ReadonlyMap<string, readonly GraphNode[]>,
): void {
  const branch = isRoot ? '' : isLast ? '└─ ' : '├─ '
  out.push(`${prefix}${branch}${renderRow(node)}`)
  const children = childrenByParent.get(node.id) ?? []
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
  children.forEach((child, i) => {
    emit(child, nextPrefix, i === children.length - 1, false, out, childrenByParent)
  })
}

function renderRow(node: GraphNode): string {
  const dur = formatDuration(node.durationMs)
  const tail = dur ? `  (${dur})` : ''
  return `${node.id}  ${node.kind} · ${node.integration}${tail}`
}

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms === undefined) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatNodeLineage(opts: FormatNodeLineageOptions): string {
  const { node, ancestors, argsJson, resultJson } = opts
  const chain = [...ancestors, node]
  const lines: string[] = []
  chain.forEach((n, i) => {
    const prefix = '   '.repeat(i)
    const branch = i === 0 ? '' : '└─ '
    const marker = n.id === node.id ? '  ←' : ''
    lines.push(`${prefix}${branch}${renderRow(n)}${marker}`)
  })

  const pretty = (raw: string): string => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }

  if (argsJson) {
    lines.push('', 'inputs:', indent(pretty(argsJson)))
  }
  if (resultJson) {
    lines.push('', 'outcome:', indent(pretty(resultJson)))
  }
  return lines.join('\n')
}

function indent(s: string): string {
  return s
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n')
}
