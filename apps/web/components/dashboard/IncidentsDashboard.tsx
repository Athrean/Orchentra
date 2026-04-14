'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Pause,
  Eye,
  ChevronRight,
  GitCommit,
  GitBranch,
  Zap,
  X,
  RotateCcw,
  FileText,
  GitPullRequest,
  Bell,
  BellOff,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { DashboardLayout } from './DashboardLayout'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import {
  useIncidents,
  useIncidentDetail,
  useRerunWorkflow,
  useCreateIssue,
  useCreateFixPR,
  useEscalateIncident,
  useSnoozeIncident,
  useDismissIncident,
  useResolveIncident,
  useMe,
} from '../../lib/hooks'
import { useIncidentWebSocket } from '../../lib/hooks/useIncidentWebSocket'
import { useWsConnectionState } from './ConnectionStatusBadge'
import { useDashboardStore } from '../../stores/dashboard'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All time' },
]

function getPeriodRange(period: Period): { from?: string; to?: string } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()

  if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) }
  if (period === 'yesterday') {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    return { from: startOfDay(y), to: endOfDay(y) }
  }
  if (period === 'week') {
    const w = new Date(now)
    w.setDate(w.getDate() - 7)
    return { from: w.toISOString() }
  }
  if (period === 'month') {
    const m = new Date(now)
    m.setDate(m.getDate() - 30)
    return { from: m.toISOString() }
  }
  return {}
}

type StatusKey =
  | 'investigating'
  | 'brief_ready'
  | 'fixing'
  | 'resolved'
  | 'snoozed'
  | 'dismissed'
  | 'escalated'
  | 'error'

const STATUS_CONFIG: Record<
  StatusKey,
  { label: string; badgeVariant: 'amber' | 'blue' | 'purple' | 'emerald' | 'muted' | 'red'; Icon: React.ElementType }
> = {
  investigating: { label: 'Investigating', badgeVariant: 'amber', Icon: Clock },
  brief_ready: { label: 'Brief Ready', badgeVariant: 'blue', Icon: Eye },
  fixing: { label: 'Fix in Progress', badgeVariant: 'purple', Icon: Zap },
  resolved: { label: 'Passed', badgeVariant: 'emerald', Icon: CheckCircle2 },
  snoozed: { label: 'Snoozed', badgeVariant: 'muted', Icon: Pause },
  dismissed: { label: 'Cancelled', badgeVariant: 'muted', Icon: XCircle },
  escalated: { label: 'Escalated', badgeVariant: 'red', Icon: Bell },
  error: { label: 'Failed', badgeVariant: 'red', Icon: AlertTriangle },
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ${sec % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

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

/* ── Skeleton loading state ── */
function SkeletonPulse({ className }: { className?: string }) {
  return <div className={cn('rounded bg-white/6 animate-pulse', className)} />
}

function IncidentsSkeleton() {
  return (
    <>
      <div className="px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--color-app-border)' }}>
        <SkeletonPulse className="h-3 w-32" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="w-full px-4 py-3.5 border-b" style={{ borderBottomColor: 'var(--color-app-border)' }}>
            <div className="flex items-start gap-3">
              <SkeletonPulse className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <SkeletonPulse className="h-4 w-48" />
                  <SkeletonPulse className="h-5 w-20 rounded-full shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <SkeletonPulse className="h-3 w-24" />
                  <SkeletonPulse className="h-3 w-32" />
                </div>
                <SkeletonPulse className="h-3 w-64" />
                <div className="flex items-center gap-3">
                  <SkeletonPulse className="h-2.5 w-16" />
                  <SkeletonPulse className="h-2.5 w-14" />
                  <SkeletonPulse className="h-2.5 w-12 ml-auto" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function getStatusColor(status: StatusKey): string {
  const map: Record<StatusKey, string> = {
    investigating: '#F59E0B',
    brief_ready: '#60A5FA',
    fixing: '#A78BFA',
    resolved: '#34D399',
    snoozed: '#6B7280',
    dismissed: '#52525B',
    escalated: '#F87171',
    error: '#F87171',
  }
  return map[status] ?? '#F87171'
}

/* ── Overview Panel (right sidebar when no incident selected) ── */
function OverviewPanel({
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

/* ── Empty state ── */
function EmptyState({ repo }: { repo: string }) {
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

/* ── Summarize hook ── */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

function useSummarize(orgId: string | undefined, incidentId: string) {
  const [summary, setSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(false)

  const summarize = useCallback(async () => {
    if (!orgId || isSummarizing) return
    setSummary('')
    setSummaryError(false)
    setIsSummarizing(true)

    try {
      const res = await fetch(`${API_BASE}/api/orgs/${orgId}/incidents/${incidentId}/summarize`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok || !res.body) {
        setSummaryError(true)
        setIsSummarizing(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        const value = chunk.value
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          // AI SDK data stream format: lines starting with 0: contain text chunks as JSON strings
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2)) as string
              setSummary((prev) => prev + text)
            } catch {
              // skip non-JSON lines
            }
          }
        }
      }
    } catch {
      setSummaryError(true)
    } finally {
      setIsSummarizing(false)
    }
  }, [orgId, incidentId, isSummarizing])

  return { summary, isSummarizing, summaryError, summarize }
}

/* ── Detail Panel ── */
function DetailPanel({ incidentId, repo, onClose }: { incidentId: string; repo: string; onClose: () => void }) {
  const { data: detail, isLoading, error } = useIncidentDetail(incidentId)
  const { data: me } = useMe()
  const { summary, isSummarizing, summaryError, summarize } = useSummarize(me?.org?.id, incidentId)

  const rerun = useRerunWorkflow(repo)
  const createIssue = useCreateIssue(repo)
  const createFixPR = useCreateFixPR(repo)
  const escalate = useEscalateIncident(repo)
  const snooze = useSnoozeIncident(repo)
  const dismiss = useDismissIncident(repo)
  const resolve = useResolveIncident(repo)

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-xs text-red-400 text-center">Failed to load incident.</p>
      </div>
    )
  }

  const inc = detail.incident
  const cfg = STATUS_CONFIG[inc.status as StatusKey] ?? STATUS_CONFIG.error
  const anyActionLoading =
    rerun.isPending ||
    createIssue.isPending ||
    createFixPR.isPending ||
    escalate.isPending ||
    snooze.isPending ||
    dismiss.isPending ||
    resolve.isPending
  const canAct = inc.status === 'brief_ready' || inc.status === 'error'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-4 py-3.5 border-b flex items-start justify-between gap-2 shrink-0"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--color-app-text)' }}>
            {inc.workflowName}
          </h2>
          {inc.failedStep && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--color-app-text-muted)' }}>
              {inc.failedStep}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 mt-0.5 transition-colors hover:text-white"
          style={{ color: 'var(--color-app-text-subtle)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Status */}
        <Badge variant={cfg.badgeVariant} icon={<cfg.Icon className="w-2.5 h-2.5" />}>
          {cfg.label}
        </Badge>

        {/* AI Summary */}
        <div>
          {!summary && !isSummarizing && !summaryError ? (
            <Button variant="primary" size="sm" icon={<Sparkles className="w-3 h-3" />} onClick={summarize}>
              Summarize
            </Button>
          ) : (
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'var(--color-app-deep)',
                borderColor: 'var(--color-app-border)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3" style={{ color: 'var(--color-brand)' }} />
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: 'var(--color-brand)' }}
                >
                  AI Summary
                </span>
                {isSummarizing && (
                  <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: 'var(--color-app-text-subtle)' }} />
                )}
              </div>
              {summaryError ? (
                <p className="text-xs text-red-400">Failed to generate summary.</p>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-secondary)' }}>
                  {summary || 'Generating...'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {canAct && (
          <Section title="Actions">
            <div className="flex flex-wrap gap-1.5">
              {inc.workflowRunId && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<RotateCcw className="w-3 h-3" />}
                  loading={rerun.isPending}
                  disabled={anyActionLoading}
                  onClick={() => rerun.mutate(inc.id)}
                >
                  Re-run
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                icon={<FileText className="w-3 h-3" />}
                loading={createIssue.isPending}
                disabled={anyActionLoading}
                onClick={() => createIssue.mutate(inc.id)}
              >
                Create Issue
              </Button>
              {inc.suggestedFix && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<GitPullRequest className="w-3 h-3" />}
                  loading={createFixPR.isPending}
                  disabled={anyActionLoading}
                  onClick={() => createFixPR.mutate(inc.id)}
                >
                  Fix PR
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                icon={<Bell className="w-3 h-3" />}
                loading={escalate.isPending}
                disabled={anyActionLoading}
                onClick={() => escalate.mutate(inc.id)}
              >
                Escalate
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <Button
                variant="muted"
                size="sm"
                icon={<BellOff className="w-3 h-3" />}
                loading={snooze.isPending && snooze.variables?.hours === 1}
                disabled={anyActionLoading}
                onClick={() => snooze.mutate({ incidentId: inc.id, hours: 1 })}
              >
                Snooze 1h
              </Button>
              <Button
                variant="muted"
                size="sm"
                icon={<BellOff className="w-3 h-3" />}
                loading={snooze.isPending && snooze.variables?.hours === 4}
                disabled={anyActionLoading}
                onClick={() => snooze.mutate({ incidentId: inc.id, hours: 4 })}
              >
                Snooze 4h
              </Button>
              <Button
                variant="muted"
                size="sm"
                icon={<XCircle className="w-3 h-3" />}
                loading={dismiss.isPending}
                disabled={anyActionLoading}
                onClick={() => dismiss.mutate(inc.id)}
              >
                Dismiss
              </Button>
            </div>
          </Section>
        )}

        {/* Resolve / Dismiss for non-terminal, non-actionable states */}
        {inc.status !== 'resolved' && inc.status !== 'dismissed' && !canAct && (
          <div className="flex gap-3">
            <button
              onClick={() => resolve.mutate(inc.id)}
              disabled={resolve.isPending}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {resolve.isPending ? 'Resolving…' : 'Resolve'}
            </button>
            <button
              onClick={() => dismiss.mutate(inc.id)}
              disabled={dismiss.isPending}
              className="text-xs font-medium transition-colors hover:text-white"
              style={{ color: 'var(--color-app-text-muted)' }}
            >
              {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
            </button>
          </div>
        )}

        {/* Error feedback */}
        {(rerun.error ||
          createIssue.error ||
          createFixPR.error ||
          escalate.error ||
          snooze.error ||
          dismiss.error ||
          resolve.error) && (
          <div className="text-xs text-red-400 rounded-lg px-3 py-2 border border-red-500/20 bg-red-500/8">
            Action failed — please try again.
          </div>
        )}

        {/* Success feedback */}
        {createIssue.data && (
          <div className="text-xs text-emerald-400 rounded-lg px-3 py-2 border border-emerald-500/20 bg-emerald-500/8">
            {createIssue.data.issueNumber ? 'Issue created: ' : 'Issue already exists: '}
            <a href={createIssue.data.issueUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {createIssue.data.issueNumber ? `#${createIssue.data.issueNumber}` : 'View'}
            </a>
          </div>
        )}
        {createFixPR.data && (
          <div className="text-xs text-emerald-400 rounded-lg px-3 py-2 border border-emerald-500/20 bg-emerald-500/8">
            {createFixPR.data.prNumber ? 'PR created: ' : 'PR already exists: '}
            <a href={createFixPR.data.prUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {createFixPR.data.prNumber ? `#${createFixPR.data.prNumber}` : 'View'}
            </a>
          </div>
        )}

        {/* Root cause */}
        {inc.rootCause && (
          <Section title="Root Cause">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-secondary)' }}>
              {inc.rootCause}
            </p>
          </Section>
        )}

        {/* Suggested fix */}
        {inc.suggestedFix && (
          <Section title="Suggested Fix">
            <div
              className="rounded-xl p-3 text-xs leading-relaxed border"
              style={{
                background: 'var(--color-app-deep)',
                borderColor: 'var(--color-app-border)',
                color: 'var(--color-app-text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {inc.suggestedFix}
            </div>
          </Section>
        )}

        {/* Metadata */}
        <Section title="Details">
          <div className="grid grid-cols-2 gap-1.5">
            <MetaCard label="Branch" value={inc.branch} mono />
            <MetaCard label="Commit" value={inc.commit.slice(0, 12)} mono />
            {inc.confidence !== null && <MetaCard label="Confidence" value={`${Math.round(inc.confidence * 100)}%`} />}
            {inc.mttrSeconds != null && <MetaCard label="MTTR" value={fmtDuration(inc.mttrSeconds)} />}
            {inc.tokenInputs != null && (
              <MetaCard
                label="Tokens"
                value={`${((inc.tokenInputs + (inc.tokenOutputs ?? 0)) / 1000).toFixed(1)}k`}
                mono
              />
            )}
            {inc.estimatedCostUsd != null && (
              <MetaCard
                label="Est. Cost"
                value={inc.estimatedCostUsd < 0.01 ? `<$0.01` : `$${inc.estimatedCostUsd.toFixed(3)}`}
              />
            )}
          </div>
        </Section>

        {/* Agent activity */}
        {detail.toolCalls.length > 0 && (
          <Section title={`Agent Activity · ${detail.toolCalls.length} calls`}>
            <div className="space-y-1">
              {detail.toolCalls.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border"
                  style={{
                    background: 'var(--color-app-deep)',
                    borderColor: 'var(--color-app-border)',
                  }}
                >
                  <div className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-brand)' }} />
                  <span className="font-medium" style={{ color: 'var(--color-app-text-secondary)' }}>
                    {tc.integration}
                  </span>
                  <span style={{ color: 'var(--color-app-text-subtle)' }}>round {tc.round}</span>
                  {tc.durationMs !== null && (
                    <span className="ml-auto" style={{ color: 'var(--color-app-text-subtle)' }}>
                      {tc.durationMs}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

/* ── Shared small components ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold tracking-widest uppercase mb-2"
        style={{ color: 'var(--color-app-text-subtle)' }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="rounded-lg p-2.5 border"
      style={{
        background: 'var(--color-app-deep)',
        borderColor: 'var(--color-app-border)',
      }}
    >
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--color-app-text-subtle)' }}>
        {label}
      </div>
      <div
        className="text-xs"
        style={{
          color: 'var(--color-app-text-secondary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}
