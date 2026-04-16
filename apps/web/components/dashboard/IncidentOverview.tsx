'use client'

import { CheckCircle2 } from 'lucide-react'

export function OverviewPanel({
  total,
  investigating,
  passed,
  failed,
}: {
  total: number
  investigating: number
  passed: number
  failed: number
}) {
  return (
    <div className="flex flex-col gap-2 p-4 h-full">
      <div className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--color-brand)' }}>
        Overview
      </div>
      <StatCard label="Total runs" value={total} />
      <StatCard label="Investigating" value={investigating} color="#F59E0B" />
      <StatCard label="Passed" value={passed} color="#34D399" />
      <StatCard label="Failed" value={failed} color="#F87171" />
      <div className="flex-1" />
      <p
        className="text-[11px] leading-relaxed rounded-xl px-3 py-2.5 border"
        style={{
          background: 'var(--color-app-raised)',
          borderColor: 'var(--color-app-border)',
          color: 'var(--color-app-text-subtle)',
        }}
      >
        Select an incident to view root cause analysis, suggested fixes, and agent activity.
      </p>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{
        background: 'var(--color-app-raised)',
        borderColor: 'var(--color-app-border)',
      }}
    >
      <div className="text-[11px] mb-1" style={{ color: 'var(--color-app-text-muted)' }}>
        {label}
      </div>
      <div className="text-2xl font-semibold" style={{ color: color ?? 'var(--color-app-text)' }}>
        {value}
      </div>
    </div>
  )
}

export function EmptyState({ repo }: { repo: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="text-center max-w-xs">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(52, 211, 153, 0.1)' }}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>
        <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-app-text)' }}>
          No incidents yet
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-muted)' }}>
          When a CI failure occurs on{' '}
          <span className="font-medium" style={{ color: 'var(--color-app-text-secondary)' }}>
            {repo}
          </span>
          , Orchentra will automatically triage it and show results here.
        </p>
      </div>
    </div>
  )
}
