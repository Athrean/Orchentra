'use client'

import { useMemo } from 'react'
import { AlertTriangle, ChevronRight, GitCommit, GitBranch } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DashboardLayout } from './DashboardLayout'
import { Badge } from '../ui/Badge'
import { useIncidents, useMe } from '../../lib/hooks'
import { useIncidentWebSocket } from '../../lib/hooks/useIncidentWebSocket'
import { useWsConnectionState } from './ConnectionStatusBadge'
import { useDashboardStore } from '../../stores/dashboard'
import { type StatusKey, PERIODS, getPeriodRange, STATUS_CONFIG, timeAgo, getStatusColor } from './incidents.utils'
import { IncidentsSkeleton } from './IncidentSkeleton'
import { OverviewPanel, EmptyState } from './IncidentOverview'
import { DetailPanel } from './IncidentDetailPanel'

export function IncidentsDashboard({ repo }: { repo: string }) {
  const { selectedIncidentId, period, setSelectedIncidentId, setPeriod } = useDashboardStore()
  const { from, to } = useMemo(() => getPeriodRange(period), [period])
  const { data, isPending, error } = useIncidents(repo, from, to)
  const { data: me, isPending: meLoading } = useMe()
  const loading = isPending || meLoading

  const wsHandle = useIncidentWebSocket(me?.org?.id, repo)
  const wsState = useWsConnectionState(wsHandle)

  const incidents = data?.incidents ?? []
  const total = data?.total ?? 0

  const investigating = incidents.filter((i) => i.status === 'investigating' || i.status === 'brief_ready').length
  const passed = incidents.filter((i) => i.status === 'resolved').length
  const failed = incidents.filter((i) => i.status === 'error' || i.status === 'escalated').length

  const rightPanel = selectedIncidentId ? (
    <DetailPanel
      key={selectedIncidentId}
      incidentId={selectedIncidentId}
      repo={repo}
      onClose={() => setSelectedIncidentId(null)}
    />
  ) : (
    <OverviewPanel total={total} investigating={investigating} passed={passed} failed={failed} />
  )

  return (
    <DashboardLayout repo={repo} rightPanel={rightPanel} wsState={wsState}>
      {/* ── Period filter ── */}
      <div
        className="px-4 py-2.5 flex items-center gap-1 shrink-0 border-b"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              period === key
                ? 'bg-white/8 text-white border-white/10'
                : 'text-[--color-app-text-muted] hover:text-white hover:bg-white/5 border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <IncidentsSkeleton />
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
              {error instanceof Error ? error.message : 'Failed to load incidents'}
            </p>
          </div>
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState repo={repo} />
      ) : (
        <>
          <div className="px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--color-app-border)' }}>
            <p className="text-[11px]" style={{ color: 'var(--color-app-text-subtle)' }}>
              {total} incident{total !== 1 ? 's' : ''} · {repo}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {incidents.map((inc) => {
              const cfg = STATUS_CONFIG[inc.status as StatusKey] ?? STATUS_CONFIG.error
              const selected = selectedIncidentId === inc.id
              return (
                <button
                  key={inc.id}
                  onClick={() => setSelectedIncidentId(selected ? null : inc.id)}
                  className={cn(
                    'w-full text-left px-4 py-3.5 border-b transition-colors hover:bg-white/2',
                    selected && 'bg-white/4 border-l-2 border-l-[--color-brand]',
                  )}
                  style={{ borderBottomColor: 'var(--color-app-border)' }}
                >
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      <cfg.Icon className="w-3.5 h-3.5" style={{ color: getStatusColor(inc.status as StatusKey) }} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                          {inc.commitMessage || inc.workflowName}
                        </span>
                        <Badge variant={cfg.badgeVariant} className="shrink-0">
                          {cfg.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--color-app-text-subtle)' }}>
                          {inc.workflowName}
                        </span>
                        {inc.failedStep && (
                          <>
                            <ChevronRight
                              className="w-3 h-3 shrink-0"
                              style={{ color: 'var(--color-app-text-subtle)' }}
                            />
                            <span className="text-[11px] truncate" style={{ color: 'var(--color-app-text-subtle)' }}>
                              {inc.failedStep}
                            </span>
                          </>
                        )}
                      </div>

                      {inc.rootCause && (
                        <p className="text-[11px] line-clamp-1 mb-2" style={{ color: 'var(--color-app-text-muted)' }}>
                          {inc.rootCause}
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        <span
                          className="flex items-center gap-1 text-[10px]"
                          style={{ color: 'var(--color-app-text-subtle)' }}
                        >
                          <GitBranch className="w-2.5 h-2.5" />
                          {inc.branch}
                        </span>
                        <span
                          className="flex items-center gap-1 text-[10px]"
                          style={{ color: 'var(--color-app-text-subtle)' }}
                        >
                          <GitCommit className="w-2.5 h-2.5" />
                          {inc.commit.slice(0, 7)}
                        </span>
                        {inc.confidence !== null && (
                          <span className="text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
                            {Math.round(inc.confidence * 100)}% conf
                          </span>
                        )}
                        <span className="ml-auto text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
                          {timeAgo(inc.triggeredAt || inc.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
