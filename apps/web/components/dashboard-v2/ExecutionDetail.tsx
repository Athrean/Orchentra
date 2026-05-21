'use client'

import { useEffect, useState } from 'react'
import { useExecutionGraph } from '../../lib/hooks/useExecutionGraph'
import { GraphView } from './GraphView'
import { NodePanel } from './NodePanel'
import { StatusPill } from './StatusPill'

export function ExecutionDetail({ executionId }: { executionId: string }) {
  const { data, isPending, error } = useExecutionGraph(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const match = window.location.hash.match(/^#?node=([^&]+)/)
    if (match?.[1]) {
      try {
        setSelectedNodeId(decodeURIComponent(match[1]))
      } catch {
        setSelectedNodeId(match[1])
      }
    }
  }, [])

  if (isPending) return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">loading…</div>
  if (error)
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">{(error as Error).message}</div>
    )
  if (!data) return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">not found</div>

  return (
    <div className="flex h-screen flex-col font-mono">
      <header className="border-b border-[var(--color-pg-hairline)] px-8 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">execution</div>
            <h1 className="truncate text-sm text-[var(--color-pg-text-0)]">{data.execution.id}</h1>
          </div>
          <StatusPill status={data.execution.status} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <GraphView
            nodes={data.nodes}
            selectedNodeId={selectedNodeId ?? undefined}
            onSelectNode={(n) => {
              setSelectedNodeId(n.id)
              window.history.replaceState(null, '', `#node=${encodeURIComponent(n.id)}`)
            }}
          />
        </div>
        {selectedNodeId && (
          <NodePanel
            nodeId={selectedNodeId}
            onClose={() => {
              setSelectedNodeId(null)
              window.history.replaceState(null, '', window.location.pathname + window.location.search)
            }}
          />
        )}
      </div>
    </div>
  )
}
