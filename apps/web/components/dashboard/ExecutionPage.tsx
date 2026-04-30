'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useExecutionGraph } from '../../lib/hooks'
import { ExecutionHeader } from './ExecutionHeader'
import { GraphView } from './GraphView'
import { NodeDetail } from './NodeDetail'
import type { GraphNode } from '../../lib/types'

export function ExecutionPage({ executionId }: { executionId: string }) {
  const { data, isLoading, error } = useExecutionGraph(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Round-trip selection through `#node=<id>` so deep links work and back/forward
  // navigation feels natural. Hash is the source of truth on load; user clicks
  // update both state and hash.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const initial = readNodeIdFromHash(window.location.hash)
    if (initial) setSelectedNodeId(initial)

    const onHashChange = () => {
      setSelectedNodeId(readNodeIdFromHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleSelectNode = (node: GraphNode) => {
    setSelectedNodeId(node.id)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#node=${encodeURIComponent(node.id)}`)
    }
  }

  const handleClearSelection = () => {
    setSelectedNodeId(null)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'var(--color-app-bg)', fontFamily: 'var(--font-body)' }}
    >
      <div className="max-w-6xl mx-auto my-4 flex gap-4 px-2">
        <main
          className="flex-1 min-w-0 rounded-2xl border overflow-hidden"
          style={{ background: 'var(--color-app-panel)', borderColor: 'var(--color-app-border)' }}
        >
          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} />
          ) : !data ? (
            <ErrorState error={new Error('Execution not found')} />
          ) : (
            <>
              <ExecutionHeader execution={data.execution} />
              <GraphView
                nodes={data.nodes}
                selectedNodeId={selectedNodeId ?? undefined}
                onSelectNode={handleSelectNode}
              />
            </>
          )}
        </main>
        {selectedNodeId && (
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--color-app-panel)', borderColor: 'var(--color-app-border)' }}
          >
            <NodeDetail key={selectedNodeId} nodeId={selectedNodeId} onClose={handleClearSelection} />
          </div>
        )}
      </div>
    </div>
  )
}

function readNodeIdFromHash(hash: string): string | null {
  // Accepts `#node=<id>` and tolerates a leading `#`.
  const match = hash.match(/^#?node=([^&]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1]!)
  } catch {
    return match[1] ?? null
  }
}

function LoadingState() {
  return (
    <div className="px-5 py-16 flex items-center justify-center">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
    </div>
  )
}

function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Failed to load execution'
  return (
    <div className="px-5 py-16 text-center">
      <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
      <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
        {message}
      </p>
    </div>
  )
}
