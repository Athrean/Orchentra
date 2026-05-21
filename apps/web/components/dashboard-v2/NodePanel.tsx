'use client'

import { X } from 'lucide-react'
import { useNodeLineage } from '../../lib/hooks/useNodeLineage'

export function NodePanel({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { data, isPending, error } = useNodeLineage(nodeId)
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-[var(--color-pg-hairline)] bg-[var(--color-pg-surface-1)] font-mono">
      <header className="flex items-center justify-between border-b border-[var(--color-pg-hairline)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-pg-text-mute)]">node</div>
          <div className="truncate text-sm text-[var(--color-pg-text-0)]">{nodeId}</div>
        </div>
        <button onClick={onClose} className="text-[var(--color-pg-text-mute)] hover:text-[var(--color-pg-text-0)]">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 text-[12px] text-[var(--color-pg-text-0)]">
        {isPending ? (
          <div className="text-[var(--color-pg-text-mute)]">loading…</div>
        ) : error ? (
          <div className="text-[var(--color-status-error)]">{(error as Error).message}</div>
        ) : !data ? (
          <div className="text-[var(--color-pg-text-mute)]">not found</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </aside>
  )
}
