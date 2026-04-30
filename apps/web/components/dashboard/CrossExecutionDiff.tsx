'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { diffExecutionGraphs, type DiffGraphNode } from '@orchentra/cli-core/render'
import { useExecutionGraph } from '../../lib/hooks'
import type { ExecutionGraph, GraphNode } from '../../lib/types'
import { NodeCard } from './NodeCard'

/**
 * Two-column side-by-side diff of two execution graphs.
 *
 * Left column = execution A with deleted nodes struck through.
 * Right column = execution B with added nodes highlighted.
 * Changed nodes appear in BOTH columns with a per-row toggle that opens an
 * inline `argsJson` / `resultJson` line-diff using the same color tokens as
 * the CLI's <DiffView /> component (red / green / cyan / dim).
 */
export interface CrossExecutionDiffProps {
  executionIdA: string
  executionIdB: string
}

export function CrossExecutionDiff({ executionIdA, executionIdB }: CrossExecutionDiffProps) {
  const queryA = useExecutionGraph(executionIdA)
  const queryB = useExecutionGraph(executionIdB)

  const isLoading = queryA.isLoading || queryB.isLoading
  const error = queryA.error ?? queryB.error
  const data = queryA.data && queryB.data ? { a: queryA.data, b: queryB.data } : null

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'var(--color-app-bg)', fontFamily: 'var(--font-body)' }}
    >
      <main
        className="max-w-6xl mx-auto my-4 rounded-2xl border overflow-hidden"
        style={{ background: 'var(--color-app-panel)', borderColor: 'var(--color-app-border)' }}
      >
        {isLoading ? (
          <DiffLoadingState />
        ) : error ? (
          <DiffErrorState error={error} />
        ) : !data ? (
          <DiffErrorState error={new Error('One or both executions not found')} />
        ) : (
          <DiffBody graphA={data.a} graphB={data.b} />
        )}
      </main>
    </div>
  )
}

interface DiffBodyProps {
  graphA: ExecutionGraph
  graphB: ExecutionGraph
}

function DiffBody({ graphA, graphB }: DiffBodyProps) {
  const result = diffExecutionGraphs(graphA.nodes as readonly DiffGraphNode[], graphB.nodes as readonly DiffGraphNode[])

  return (
    <div>
      <DiffHeader graphA={graphA} graphB={graphB} result={result} />
      <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--color-app-border)' }}>
        <DiffColumn
          side="a"
          executionId={graphA.executionId}
          unchanged={result.unchanged.map((entry) => entry.a)}
          changed={result.changed.map((entry) => ({ self: entry.a, other: entry.b }))}
          markedNodes={result.removed}
          markerLabel="removed"
        />
        <DiffColumn
          side="b"
          executionId={graphB.executionId}
          unchanged={result.unchanged.map((entry) => entry.b)}
          changed={result.changed.map((entry) => ({ self: entry.b, other: entry.a }))}
          markedNodes={result.added}
          markerLabel="added"
        />
      </div>
    </div>
  )
}

function DiffHeader({
  graphA,
  graphB,
  result,
}: {
  graphA: ExecutionGraph
  graphB: ExecutionGraph
  result: ReturnType<typeof diffExecutionGraphs>
}) {
  return (
    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-app-border)' }}>
      <h1 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-app-text)' }}>
        Diff: {graphA.executionId.slice(0, 8)} ↔ {graphB.executionId.slice(0, 8)}
      </h1>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--color-app-text-muted)' }}>
        <span>
          <span style={{ color: 'green' }}>+{result.added.length}</span> added
        </span>
        <span>
          <span style={{ color: 'red' }}>-{result.removed.length}</span> removed
        </span>
        <span>
          <span style={{ color: 'cyan' }}>~{result.changed.length}</span> changed
        </span>
        <span>{result.unchanged.length} unchanged</span>
      </div>
    </div>
  )
}

interface DiffColumnProps {
  side: 'a' | 'b'
  executionId: string
  unchanged: DiffGraphNode[]
  changed: { self: DiffGraphNode; other: DiffGraphNode }[]
  markedNodes: readonly DiffGraphNode[]
  markerLabel: 'added' | 'removed'
}

function DiffColumn({ side, executionId, unchanged, changed, markedNodes, markerLabel }: DiffColumnProps) {
  return (
    <div className="px-4 py-4" style={{ background: 'var(--color-app-panel)' }}>
      <div className="text-[11px] mb-2" style={{ color: 'var(--color-app-text-muted)' }}>
        {side.toUpperCase()} · {executionId.slice(0, 8)}
      </div>
      <div className="grid gap-2">
        {unchanged.map((node) => (
          <NodeRow key={`u-${node.id}`} node={node} variant="unchanged" />
        ))}
        {changed.map(({ self, other }) => (
          <ChangedNodeRow key={`c-${self.id}`} self={self} other={other} side={side} />
        ))}
        {markedNodes.map((node) => (
          <NodeRow key={`m-${node.id}`} node={node} variant={markerLabel} />
        ))}
      </div>
    </div>
  )
}

interface NodeRowProps {
  node: DiffGraphNode
  variant: 'unchanged' | 'added' | 'removed'
}

function NodeRow({ node, variant }: NodeRowProps) {
  const wrapperStyle =
    variant === 'removed'
      ? { textDecoration: 'line-through', opacity: 0.7 }
      : variant === 'added'
        ? { boxShadow: '0 0 0 1px green inset', borderRadius: '0.5rem' }
        : undefined

  return (
    <div data-variant={variant} style={wrapperStyle}>
      <NodeCard node={node as GraphNode} />
    </div>
  )
}

interface ChangedNodeRowProps {
  self: DiffGraphNode
  other: DiffGraphNode
  side: 'a' | 'b'
}

function ChangedNodeRow({ self, other, side }: ChangedNodeRowProps) {
  const [open, setOpen] = useState(false)
  return (
    <div data-variant="changed" style={{ borderRadius: '0.5rem', boxShadow: '0 0 0 1px cyan inset' }} className="grid">
      <NodeCard node={self as GraphNode} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] text-left px-3 py-1"
        style={{ color: 'cyan' }}
      >
        {open ? '▾ hide diff' : '▸ show diff'}
      </button>
      {open && (
        <div className="px-3 pb-2 grid gap-2">
          <FieldDiff
            label="argsJson"
            left={side === 'a' ? self.argsJson : other.argsJson}
            right={side === 'a' ? other.argsJson : self.argsJson}
          />
          <FieldDiff
            label="resultJson"
            left={side === 'a' ? self.resultJson : other.resultJson}
            right={side === 'a' ? other.resultJson : self.resultJson}
          />
        </div>
      )}
    </div>
  )
}

interface FieldDiffProps {
  label: string
  left: string | null | undefined
  right: string | null | undefined
}

function FieldDiff({ label, left, right }: FieldDiffProps) {
  const lines = computeLineDiff(prettyJson(left), prettyJson(right))
  if (lines.length === 0) return null
  return (
    <div className="rounded border px-2 py-1" style={{ borderColor: 'var(--color-app-border)' }}>
      <div className="text-[10px] mb-1" style={{ color: 'var(--color-app-text-subtle)' }}>
        {label}
      </div>
      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} style={{ color: lineColor(line.kind), opacity: line.kind === 'meta' ? 0.6 : 1 }}>
            {line.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

type DiffLineKind = 'add' | 'del' | 'context' | 'hunk' | 'meta'

interface DiffLine {
  kind: DiffLineKind
  text: string
}

function lineColor(kind: DiffLineKind): string {
  switch (kind) {
    case 'add':
      return 'green'
    case 'del':
      return 'red'
    case 'hunk':
      return 'cyan'
    case 'meta':
      return 'var(--color-app-text-subtle)'
    case 'context':
      return 'var(--color-app-text)'
  }
}

function prettyJson(raw: string | null | undefined): string {
  if (raw == null || raw === '') return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// Tiny line-diff. Mirrors the line-based approach in apps/cli/src/tui/components/DiffView.tsx
// (which classifies lines that already start with +/-). Here we walk both sides
// and tag each line as add/del/context. Greedy and stable — sufficient for
// argsJson/resultJson diffs which tend to be small.
function computeLineDiff(left: string, right: string): DiffLine[] {
  if (left === right) return []
  const leftLines = left ? left.split('\n') : []
  const rightLines = right ? right.split('\n') : []
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < leftLines.length || j < rightLines.length) {
    const l = leftLines[i]
    const r = rightLines[j]
    if (l !== undefined && r !== undefined && l === r) {
      out.push({ kind: 'context', text: ` ${l}` })
      i++
      j++
      continue
    }
    if (l !== undefined && (r === undefined || !rightLines.slice(j).includes(l))) {
      out.push({ kind: 'del', text: `-${l}` })
      i++
      continue
    }
    if (r !== undefined) {
      out.push({ kind: 'add', text: `+${r}` })
      j++
      continue
    }
  }
  return out
}

function DiffLoadingState() {
  return (
    <div className="px-5 py-16 flex items-center justify-center">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
    </div>
  )
}

function DiffErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Failed to load diff'
  return (
    <div className="px-5 py-16 text-center">
      <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
      <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
        {message}
      </p>
    </div>
  )
}
