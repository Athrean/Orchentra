'use client'

import { useState } from 'react'
import { diffExecutionGraphs, type DiffGraphNode } from '@orchentra/cli-core/render'
import { useExecutionGraph } from '../../lib/hooks/useExecutionGraph'
import type { ExecutionGraph } from '../../lib/types'

export function CrossExecDiff({ a, b }: { a: string; b: string }) {
  const queryA = useExecutionGraph(a)
  const queryB = useExecutionGraph(b)

  const isLoading = queryA.isLoading || queryB.isLoading
  const error = queryA.error ?? queryB.error
  const data = queryA.data && queryB.data ? { a: queryA.data, b: queryB.data } : null

  if (isLoading) {
    return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">loading…</div>
  }
  if (error) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">
        {error instanceof Error ? error.message : 'Failed to load diff'}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">
        One or both executions not found
      </div>
    )
  }

  return <DiffBody graphA={data.a} graphB={data.b} />
}

interface DiffBodyProps {
  graphA: ExecutionGraph
  graphB: ExecutionGraph
}

function DiffBody({ graphA, graphB }: DiffBodyProps) {
  const result = diffExecutionGraphs(graphA.nodes as readonly DiffGraphNode[], graphB.nodes as readonly DiffGraphNode[])

  return (
    <div className="px-8 py-6 font-mono">
      <header className="mb-6 border-b border-[var(--color-pg-hairline)] pb-4">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">diff</h1>
        <p className="mt-1 text-xs text-[var(--color-pg-text-mute)]">
          {graphA.executionId.slice(0, 8)} ↔ {graphB.executionId.slice(0, 8)}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span style={{ color: 'green' }}>+{result.added.length} added</span>
          <span style={{ color: 'red' }}>-{result.removed.length} removed</span>
          <span style={{ color: 'cyan' }}>~{result.changed.length} changed</span>
          <span className="text-[var(--color-pg-text-mute)]">{result.unchanged.length} unchanged</span>
        </div>
      </header>
      <div
        className="grid grid-cols-2 gap-px rounded border border-[var(--color-pg-hairline)]"
        style={{ background: 'var(--color-pg-hairline)' }}
      >
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
    <div className="bg-[var(--color-pg-surface-1)] px-4 py-4">
      <div className="mb-2 text-[11px] text-[var(--color-pg-text-mute)]">
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
    <div
      data-variant={variant}
      style={wrapperStyle}
      className="rounded border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-2)] px-3 py-2 text-xs"
    >
      <div className="text-[var(--color-pg-text-0)]">{node.kind}</div>
      <div className="text-[10px] text-[var(--color-pg-text-mute)]">{node.id.slice(0, 16)}</div>
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
    <div
      data-variant="changed"
      style={{ borderRadius: '0.5rem', boxShadow: '0 0 0 1px cyan inset' }}
      className="grid border border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-2)]"
    >
      <div className="px-3 py-2 text-xs">
        <div className="text-[var(--color-pg-text-0)]">{self.kind}</div>
        <div className="text-[10px] text-[var(--color-pg-text-mute)]">{self.id.slice(0, 16)}</div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1 text-left text-[11px]"
        style={{ color: 'cyan' }}
      >
        {open ? '▾ hide diff' : '▸ show diff'}
      </button>
      {open && (
        <div className="grid gap-2 px-3 pb-2">
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
    <div className="rounded border border-[var(--color-pg-hairline)] px-2 py-1">
      <div className="mb-1 text-[10px] text-[var(--color-pg-text-mute)]">{label}</div>
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
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
      return 'var(--color-pg-text-mute)'
    case 'context':
      return 'var(--color-pg-text-0)'
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
