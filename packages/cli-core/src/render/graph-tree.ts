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

export function formatGraphTree(nodes: readonly GraphNode[]): string {
  if (nodes.length === 0) return ''

  const idSet = new Set(nodes.map((n) => n.id))
  const childIndex = new Map<string, GraphNode[]>()
  const roots: GraphNode[] = []
  for (const node of nodes) {
    const isRoot = node.parentNodeId === null || !idSet.has(node.parentNodeId)
    if (isRoot) {
      roots.push(node)
      continue
    }
    const arr = childIndex.get(node.parentNodeId!) ?? []
    arr.push(node)
    childIndex.set(node.parentNodeId!, arr)
  }
  Array.from(childIndex.values()).forEach((arr) => arr.sort((a, b) => a.round - b.round))
  roots.sort((a, b) => a.round - b.round)

  const lines: string[] = []
  for (const root of roots) emit(root, '', true, true, lines, childIndex)
  return lines.join('\n')
}

function emit(
  node: GraphNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  out: string[],
  childIndex: Map<string, GraphNode[]>,
): void {
  const branch = isRoot ? '' : isLast ? '└─ ' : '├─ '
  out.push(`${prefix}${branch}${renderRow(node)}`)
  const children = childIndex.get(node.id) ?? []
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
  children.forEach((child, i) => {
    emit(child, nextPrefix, i === children.length - 1, false, out, childIndex)
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
