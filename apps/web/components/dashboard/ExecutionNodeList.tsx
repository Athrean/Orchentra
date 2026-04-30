'use client'

import type { GraphNode } from '../../lib/types'

/**
 * Flat list of nodes for an execution. V2 placeholder — V3 swaps this for
 * <GraphView> once the layout primitive is wired.
 */
export function ExecutionNodeList({ nodes }: { nodes: GraphNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
          No nodes yet for this execution.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--color-app-border)' }}>
      {nodes.map((node) => (
        <li key={node.id} className="px-5 py-3" style={{ borderColor: 'var(--color-app-border)' }}>
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-mono shrink-0 tabular-nums"
              style={{ color: 'var(--color-app-text-subtle)' }}
            >
              #{node.round}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--color-app-text)' }}>
                  {node.integration}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-app-text-muted)' }}>
                  {node.kind}
                </span>
              </div>
              <span className="text-[10px] font-mono truncate block" style={{ color: 'var(--color-app-text-subtle)' }}>
                {node.id}
              </span>
            </div>
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--color-app-text-muted)' }}>
              {formatNodeDuration(node.durationMs)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function formatNodeDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
