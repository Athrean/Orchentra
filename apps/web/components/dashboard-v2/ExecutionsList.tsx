'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useIncidents } from '../../lib/hooks/useIncidents'
import { useAvailableRepos } from '../../lib/hooks/useRepos'
import { StatusPill } from './StatusPill'

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function ExecutionsList() {
  const { data: repos, isPending: reposLoading } = useAvailableRepos()
  const repo = repos?.find((r) => r.monitored)?.fullName ?? repos?.[0]?.fullName ?? ''

  const range = useMemo(() => ({ from: isoDaysAgo(7), to: new Date().toISOString() }), [])
  const { data, isPending, error } = useIncidents(repo, range.from, range.to)

  if (reposLoading || isPending) {
    return <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">loading…</div>
  }

  if (!repo) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-pg-text-mute)]">
        no monitored repos.{' '}
        <Link href="/onboarding" className="text-[var(--color-pg-accent-coral)]">
          connect a repo →
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-8 py-6 font-mono text-sm text-[var(--color-status-error)]">
        {error instanceof Error ? error.message : 'failed to load executions'}
      </div>
    )
  }

  const incidents = data?.incidents ?? []

  return (
    <div className="px-8 py-6 font-mono">
      <header className="mb-6">
        <h1 className="text-base font-semibold text-[var(--color-pg-text-0)]">executions</h1>
        <p className="mt-1 text-xs text-[var(--color-pg-text-mute)]">
          {repo} · last 7 days · {incidents.length} runs
        </p>
      </header>
      <ul className="divide-y divide-[var(--color-pg-hairline)] border-y border-[var(--color-pg-hairline)]">
        {incidents.map((inc) => (
          <li key={inc.id}>
            <Link
              href={`/dashboard/exec/${encodeURIComponent(inc.id)}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-[var(--color-pg-surface-1)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[var(--color-pg-text-0)]">{inc.commitMessage || inc.workflowName}</div>
                <div className="mt-1 truncate text-[11px] text-[var(--color-pg-text-mute)]">
                  {inc.workflowName} · {inc.branch} · {inc.commit.slice(0, 7)}
                </div>
              </div>
              <StatusPill status={inc.status} />
            </Link>
          </li>
        ))}
        {incidents.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-[var(--color-pg-text-mute)]">no executions in range</li>
        )}
      </ul>
    </div>
  )
}
