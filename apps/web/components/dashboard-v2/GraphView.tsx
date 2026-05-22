'use client'

import type { GraphNode } from '../../lib/types'

export function GraphView({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: GraphNode[]
  selectedNodeId?: string
  onSelectNode: (n: GraphNode) => void
}) {
  const COLS = 5
  const W = 180
  const H = 64
  const GAP_X = 32
  const GAP_Y = 32

  const positioned = nodes.map((n, i) => ({
    n,
    x: (i % COLS) * (W + GAP_X) + GAP_X,
    y: Math.floor(i / COLS) * (H + GAP_Y) + GAP_Y,
  }))

  const rows = Math.ceil(nodes.length / COLS)
  const width = COLS * (W + GAP_X) + GAP_X
  const height = rows * (H + GAP_Y) + GAP_Y

  return (
    <div className="overflow-auto border-y border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="block" style={{ minWidth: width, height }}>
        {positioned.map(({ n, x, y }) => {
          const selected = n.id === selectedNodeId
          return (
            <g key={n.id} onClick={() => onSelectNode(n)} className="cursor-pointer">
              <rect
                x={x}
                y={y}
                width={W}
                height={H}
                fill="var(--color-pg-surface-2)"
                stroke={selected ? 'var(--color-pg-accent-green)' : 'var(--color-pg-hairline)'}
                strokeWidth={selected ? 2 : 1}
              />
              <text x={x + 12} y={y + 22} fontSize="11" fontFamily="ui-monospace" fill="var(--color-pg-text-0)">
                {n.kind}
              </text>
              <text x={x + 12} y={y + 42} fontSize="10" fontFamily="ui-monospace" fill="var(--color-pg-text-mute)">
                {n.id.slice(0, 16)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
