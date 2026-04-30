'use client'

import type { GraphNode } from '../../lib/types'

/**
 * Pure card for one execution node. Renders only the kind-agnostic facets
 * (kind, integration, round, durationMs); kind-specific UI lives in headers
 * and detail panels, never inside the graph tree.
 *
 * `selected` + `onSelect` are wired in V4 (node detail panel). V3 exposes
 * the props so the graph tree can be tested without re-shaping later.
 */
export interface NodeCardProps {
  node: GraphNode
  selected?: boolean
  onSelect?: (node: GraphNode) => void
}

export function NodeCard({ node, selected = false, onSelect }: NodeCardProps) {
  const handleClick = onSelect ? () => onSelect(node) : undefined
  const interactive = !!onSelect

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!interactive}
      aria-pressed={interactive ? selected : undefined}
      className="w-full text-left rounded-lg border px-3 py-2 transition-colors disabled:cursor-default"
      style={{
        background: selected ? 'var(--color-app-deep)' : 'var(--color-app-panel)',
        borderColor: selected ? 'var(--color-brand)' : 'var(--color-app-border)',
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
          {node.integration}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--color-app-text-muted)' }}>
          {node.kind}
        </span>
        <span
          className="ml-auto text-[10px] font-mono tabular-nums shrink-0"
          style={{ color: 'var(--color-app-text-subtle)' }}
        >
          #{node.round}
        </span>
      </div>
      <span className="text-[11px] tabular-nums block" style={{ color: 'var(--color-app-text-muted)' }}>
        {formatNodeDuration(node.durationMs)}
      </span>
    </button>
  )
}

function formatNodeDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
