import type { GraphNode } from './graph-tree'

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

export function diffExecutionGraphs(
  a: readonly DiffGraphNode[],
  b: readonly DiffGraphNode[],
): ExecutionGraphDiff {
  const unchanged: UnchangedDiffEntry[] = []
  for (let i = 0; i < a.length; i++) {
    unchanged.push({ a: a[i]!, b: b[i]! })
  }
  return { added: [], removed: [], changed: [], unchanged }
}
