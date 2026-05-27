'use client'

import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface Props {
  installationId: number
  repoFullName: string
  runId: number
}

export function RerunButton({ installationId, repoFullName, runId }: Props) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/github/rerun', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId, repoFullName, runId }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'rerun failed')
      }
      toast.success('Re-run queued for failed jobs')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'rerun failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border border-pg-hairline bg-pg-surface-1 px-2.5 py-1 text-xs text-pg-text-0 transition-colors hover:bg-pg-surface-2 disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Re-running…' : 'Re-run failed jobs'}
    </button>
  )
}
