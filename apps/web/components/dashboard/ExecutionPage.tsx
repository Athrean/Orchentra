'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useExecutionGraph } from '../../lib/hooks'
import { ExecutionHeader } from './ExecutionHeader'
import { GraphView } from './GraphView'
import { NodeDetail } from './NodeDetail'
import type { GraphNode } from '../../lib/types'

export function ExecutionPage({ executionId }: { executionId: string }) {
  const { data, isLoading, error } = useExecutionGraph(executionId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const handleSelectNode = (node: GraphNode) => setSelectedNodeId(node.id)
  const handleClearSelection = () => setSelectedNodeId(null)

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
