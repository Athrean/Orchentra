'use client'

import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { cn } from '../lib/utils'
import { DashboardLayout } from './DashboardLayout'
import {
  useIncidents,
  useIncidentDetail,
  useIncidentSSE,
  useRerunWorkflow,
  useCreateIssue,
  useCreateFixPR,
  useEscalateIncident,
  useSnoozeIncident,
  useDismissIncident,
  useResolveIncident,
} from '../lib/hooks'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All' },
]

function getPeriodRange(period: Period): { from?: string; to?: string } {
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()

  if (period === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) }
  }
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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  investigating: { label: 'Investigating', color: 'text-amber-400', bg: 'bg-amber-400/10', Icon: Clock },
  brief_ready: { label: 'Brief Ready', color: 'text-blue-400', bg: 'bg-blue-400/10', Icon: Eye },
  fixing: { label: 'Fixing', color: 'text-purple-400', bg: 'bg-purple-400/10', Icon: Zap },
  resolved: { label: 'Passed', color: 'text-emerald-400', bg: 'bg-emerald-400/10', Icon: CheckCircle2 },
  snoozed: { label: 'Snoozed', color: 'text-gray-400', bg: 'bg-gray-400/10', Icon: Pause },
  dismissed: { label: 'Cancelled', color: 'text-gray-500', bg: 'bg-gray-500/10', Icon: XCircle },
  escalated: { label: 'Escalated', color: 'text-red-400', bg: 'bg-red-400/10', Icon: Bell },
  error: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-400/10', Icon: AlertTriangle },
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
  const [period, setPeriod] = useState<Period>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { from, to } = useMemo(() => getPeriodRange(period), [period])
  const { data, isLoading, error } = useIncidents(repo, from, to)

  // SSE for real-time updates — invalidates queries automatically
  useIncidentSSE(repo)

  const incidents = data?.incidents ?? []
  const total = data?.total ?? 0

  // Stats for right panel when nothing selected
  const investigating = incidents.filter((i) => i.status === 'investigating' || i.status === 'brief_ready').length
  const passed = incidents.filter((i) => i.status === 'resolved').length
  const failed = incidents.filter((i) => i.status === 'error' || i.status === 'escalated').length

  const rightPanel = selectedId ? (
    <DetailPanel key={selectedId} incidentId={selectedId} repo={repo} onClose={() => setSelectedId(null)} />
  ) : (
    // Stats overview
    <div className="flex flex-col gap-2 p-4 flex-1">
      <div className="text-[10px] font-bold text-[#FF4500] tracking-wider mb-2">OVERVIEW</div>
      <StatCard label="Total Runs" value={total} />
      <StatCard label="Investigating" value={investigating} color="text-amber-400" />
      <StatCard label="Passed" value={passed} color="text-emerald-400" />
      <StatCard label="Failed" value={failed} color="text-red-400" />
      <div className="flex-1" />
      <div className="bg-[#21242C] p-3 rounded-xl text-xs text-gray-500 border border-white/5 leading-relaxed">
        Select an incident to view root cause analysis, suggested fixes, and agent activity.
      </div>
    </div>
  )

  return (
    <DashboardLayout repo={repo} rightPanel={rightPanel}>
      {/* Period filter header — always visible */}
      <div className="px-6 py-3 border-b border-white/5 flex items-center gap-1 shrink-0">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              period === key
                ? 'bg-white/10 text-white border border-white/10'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main content: incidents list */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400">{error instanceof Error ? error.message : 'Failed to load'}</p>
          </div>
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-medium mb-2">No incidents yet</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              When a CI failure occurs on <span className="text-gray-300 font-medium">{repo}</span>, Orchentra will
              automatically triage it and show results here.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* List header */}
          <div className="px-6 py-3 border-b border-white/5 shrink-0">
            <p className="text-xs text-gray-500">
              {total} incident{total !== 1 ? 's' : ''} &middot; {repo}
            </p>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {incidents.map((inc) => {
              const s = STATUS_MAP[inc.status] ?? STATUS_MAP.error
              const selected = selectedId === inc.id
              return (
                <button
                  key={inc.id}
                  onClick={() => setSelectedId(selected ? null : inc.id)}
                  className={cn(
                    'w-full text-left px-6 py-4 border-b border-white/5 transition-colors hover:bg-white/3',
                    selected && 'bg-white/5 border-l-2 border-l-[#FF4500]',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0', s.bg)}>
                      <s.Icon className={cn('w-3.5 h-3.5', s.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{inc.commitMessage || inc.workflowName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-gray-500 truncate">{inc.workflowName}</span>
                        {inc.failedStep && (
                          <>
                            <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
                            <span className="text-xs text-gray-500 truncate">{inc.failedStep}</span>
                          </>
                        )}
                      </div>
                      {inc.rootCause && <p className="text-xs text-gray-500 line-clamp-1 mb-1.5">{inc.rootCause}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-gray-600">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          {inc.branch}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitCommit className="w-3 h-3" />
                          {inc.commit.slice(0, 7)}
                        </span>
                        {inc.confidence !== null && <span>{Math.round(inc.confidence * 100)}% confidence</span>}
                        <span className="ml-auto">{timeAgo(inc.triggeredAt || inc.createdAt)}</span>
                      </div>
                    </div>
                    <span className={cn('shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full', s.bg, s.color)}>
                      {s.label}
                    </span>
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

/* ---------- Detail Panel ---------- */

function DetailPanel({ incidentId, repo, onClose }: { incidentId: string; repo: string; onClose: () => void }) {
  const { data: detail, isLoading, error } = useIncidentDetail(incidentId)

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
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400 text-center">Failed to load incident details.</p>
      </div>
    )
  }

  const inc = detail.incident
  const s = STATUS_MAP[inc.status] ?? STATUS_MAP.error
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
      <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{inc.workflowName}</h2>
          {inc.failedStep && <p className="text-xs text-gray-500 mt-0.5 truncate">Step: {inc.failedStep}</p>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors shrink-0 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', s.bg, s.color)}>
            <s.Icon className="w-3 h-3" />
            {s.label}
          </span>
        </div>

        {/* Action Buttons */}
        {canAct && (
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {inc.workflowRunId && (
                <ActionButton
                  icon={<RotateCcw className="w-3 h-3" />}
                  label="Re-run"
                  loading={rerun.isPending}
                  disabled={anyActionLoading}
                  onClick={() => rerun.mutate(inc.id)}
                />
              )}
              <ActionButton
                icon={<FileText className="w-3 h-3" />}
                label="Create Issue"
                loading={createIssue.isPending}
                disabled={anyActionLoading}
                onClick={() => createIssue.mutate(inc.id)}
              />
              {inc.suggestedFix && (
                <ActionButton
                  icon={<GitPullRequest className="w-3 h-3" />}
                  label="Fix PR"
                  loading={createFixPR.isPending}
                  disabled={anyActionLoading}
                  onClick={() => createFixPR.mutate(inc.id)}
                />
              )}
              <ActionButton
                icon={<Bell className="w-3 h-3" />}
                label="Escalate"
                loading={escalate.isPending}
                disabled={anyActionLoading}
                variant="danger"
                onClick={() => escalate.mutate(inc.id)}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <ActionButton
                icon={<BellOff className="w-3 h-3" />}
                label="Snooze 1h"
                loading={snooze.isPending && snooze.variables?.hours === 1}
                disabled={anyActionLoading}
                variant="muted"
                onClick={() => snooze.mutate({ incidentId: inc.id, hours: 1 })}
              />
              <ActionButton
                icon={<BellOff className="w-3 h-3" />}
                label="Snooze 4h"
                loading={snooze.isPending && snooze.variables?.hours === 4}
                disabled={anyActionLoading}
                variant="muted"
                onClick={() => snooze.mutate({ incidentId: inc.id, hours: 4 })}
              />
              <ActionButton
                icon={<XCircle className="w-3 h-3" />}
                label="Dismiss"
                loading={dismiss.isPending}
                disabled={anyActionLoading}
                variant="muted"
                onClick={() => dismiss.mutate(inc.id)}
              />
            </div>
          </Section>
        )}

        {/* Resolve / Dismiss for active incidents */}
        {inc.status !== 'resolved' && inc.status !== 'dismissed' && !canAct && (
          <div className="flex gap-2">
            <button
              onClick={() => resolve.mutate(inc.id)}
              disabled={resolve.isPending}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              {resolve.isPending ? 'Resolving...' : 'Resolve'}
            </button>
            <button
              onClick={() => dismiss.mutate(inc.id)}
              disabled={dismiss.isPending}
              className="text-xs text-gray-500 hover:text-gray-300 font-medium transition-colors"
            >
              {dismiss.isPending ? 'Dismissing...' : 'Dismiss'}
            </button>
          </div>
        )}

        {/* Mutation errors */}
        {(rerun.error ||
          createIssue.error ||
          createFixPR.error ||
          escalate.error ||
          snooze.error ||
          dismiss.error ||
          resolve.error) && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            Action failed. Please try again.
          </div>
        )}

        {/* Mutation success feedback */}
        {createIssue.data && (
          <div className="text-xs text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2">
            {createIssue.data.issueNumber ? 'Issue created: ' : 'Issue already exists: '}
            <a href={createIssue.data.issueUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {createIssue.data.issueNumber ? `#${createIssue.data.issueNumber}` : 'View issue'}
            </a>
          </div>
        )}
        {createFixPR.data && (
          <div className="text-xs text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2">
            {createFixPR.data.prNumber ? 'PR created: ' : 'PR already exists: '}
            <a href={createFixPR.data.prUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {createFixPR.data.prNumber ? `#${createFixPR.data.prNumber}` : 'View PR'}
            </a>
          </div>
        )}

        {/* Root cause */}
        {inc.rootCause && (
          <Section title="Root Cause">
            <p className="text-sm text-gray-300 leading-relaxed">{inc.rootCause}</p>
          </Section>
        )}

        {/* Suggested fix */}
        {inc.suggestedFix && (
          <Section title="Suggested Fix">
            <div className="bg-black/30 rounded-xl p-3 text-sm text-gray-300 leading-relaxed font-mono border border-white/5">
              {inc.suggestedFix}
            </div>
          </Section>
        )}

        {/* Metadata */}
        <Section title="Details">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetaCard label="Branch" value={inc.branch} mono />
            <MetaCard label="Commit" value={inc.commit.slice(0, 12)} mono />
            {inc.confidence !== null && <MetaCard label="Confidence" value={`${Math.round(inc.confidence * 100)}%`} />}
            {inc.mttrSeconds != null && <MetaCard label="MTTR" value={fmtDuration(inc.mttrSeconds)} />}
          </div>
        </Section>

        {/* Tool calls */}
        {detail.toolCalls.length > 0 && (
          <Section title={`Agent Activity (${detail.toolCalls.length} calls)`}>
            <div className="space-y-1.5">
              {detail.toolCalls.map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 text-xs bg-black/20 rounded-lg px-3 py-2 border border-white/5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#FF4500] shrink-0" />
                  <span className="text-gray-300 font-medium">{tc.integration}</span>
                  <span className="text-gray-600">round {tc.round}</span>
                  {tc.durationMs !== null && <span className="text-gray-600 ml-auto">{tc.durationMs}ms</span>}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

/* ---------- Shared small components ---------- */

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  variant = 'default',
  onClick,
}: {
  icon: React.ReactNode
  label: string
  loading: boolean
  disabled: boolean
  variant?: 'default' | 'danger' | 'muted'
  onClick: () => void
}) {
  const styles = {
    default: 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/5',
    danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20',
    muted: 'bg-white/3 hover:bg-white/5 text-gray-500 border-white/3',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors',
        styles[variant],
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-2">{title}</div>
      {children}
    </div>
  )
}

function MetaCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-black/20 rounded-lg p-2.5 border border-white/5">
      <div className="text-gray-500 mb-0.5">{label}</div>
      <div className={cn('text-gray-300', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#21242C] rounded-xl p-4 border border-white/5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={cn('text-2xl font-semibold', color || 'text-white')}>{value}</div>
    </div>
  )
}
