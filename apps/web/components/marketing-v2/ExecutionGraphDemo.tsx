// apps/web/components/marketing-v2/ExecutionGraphDemo.tsx
'use client'

import { useEffect, useRef, useState } from 'react'

export function ExecutionGraphDemo() {
  const ref = useRef<SVGSVGElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.25 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const animate = visible && !reduced

  return (
    <section className="border-y border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <svg
          ref={ref}
          viewBox="0 0 960 320"
          className="block h-[480px] w-full"
          role="img"
          aria-label="sample execution graph"
        >
          {/* hairline grid */}
          <g stroke="var(--color-pg-hairline)" strokeWidth="1">
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 120} y1={0} x2={i * 120} y2={320} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={`h-${i}`} x1={0} y1={i * 64} x2={960} y2={i * 64} />
            ))}
          </g>

          {/* nodes */}
          {NODES.map((n) => (
            <g key={n.id}>
              <rect
                x={n.x - 64}
                y={n.y - 16}
                width={128}
                height={32}
                fill="var(--color-pg-surface-2)"
                stroke="var(--color-pg-hairline)"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="11"
                fontFamily="ui-monospace"
                fill="var(--color-pg-text-0)"
              >
                {n.label}
              </text>
            </g>
          ))}

          {/* edges */}
          {EDGES.map((e, i) => {
            const a = NODES.find((n) => n.id === e.from)!
            const b = NODES.find((n) => n.id === e.to)!
            const path = `M ${a.x + 64} ${a.y} L ${b.x - 64} ${b.y}`
            return (
              <path
                key={i}
                d={path}
                stroke="var(--color-pg-accent-coral)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="240"
                strokeDashoffset={animate ? 0 : 240}
                style={{ transition: 'stroke-dashoffset 1.2s ease-out', transitionDelay: `${i * 120}ms` }}
              />
            )
          })}
        </svg>
        <p className="mt-6 text-xs text-[var(--color-pg-text-mute)]">
          every CLI invocation, MCP tool call, and webhook lands on the same graph
        </p>
      </div>
    </section>
  )
}

const NODES = [
  { id: 'webhook', x: 96, y: 96, label: 'github.webhook' },
  { id: 'op', x: 320, y: 96, label: 'op:ci_failure' },
  { id: 'mcp-a', x: 544, y: 48, label: 'mcp.gh.search' },
  { id: 'mcp-b', x: 544, y: 144, label: 'mcp.gh.diff' },
  { id: 'brief', x: 768, y: 96, label: 'node:brief' },
  { id: 'fix', x: 768, y: 224, label: 'node:fix' },
] as const

const EDGES = [
  { from: 'webhook', to: 'op' },
  { from: 'op', to: 'mcp-a' },
  { from: 'op', to: 'mcp-b' },
  { from: 'mcp-a', to: 'brief' },
  { from: 'mcp-b', to: 'brief' },
  { from: 'brief', to: 'fix' },
] as const
