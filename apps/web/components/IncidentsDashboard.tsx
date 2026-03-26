'use client'

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { cn } from '../lib/utils'
import { api } from '../lib/api'
import { DashboardLayout } from './DashboardLayout'

interface Incident {
  id: string
  repo: string
  branch: string
  commit: string
  workflowName: string
  workflowRunId: number | null
  failedStep: string | null
  status: string
  confidence: number | null
  rootCause: string | null
  triggeredAt: string | null
  createdAt: string
}

interface IncidentFull extends Incident {
  briefJson: string | null
  suggestedFix: string | null
  resolvedAt: string | null
  mttrSeconds: number | null
}

interface ToolCall {
  id: string
  integration: string
  round: number
  durationMs: number | null
  createdAt: string
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  investigating: { label: 'Investigating', color: 'text-amber-400', bg: 'bg-amber-400/10', Icon: Clock },
  brief_ready: { label: 'Brief Ready', color: 'text-blue-400', bg: 'bg-blue-400/10', Icon: Eye },
  fixing: { label: 'Fixing', color: 'text-purple-400', bg: 'bg-purple-400/10', Icon: Zap },
  resolved: { label: 'Resolved', color: 'text-emerald-400', bg: 'bg-emerald-400/10', Icon: CheckCircle2 },
  snoozed: { label: 'Snoozed', color: 'text-gray-400', bg: 'bg-gray-400/10', Icon: Pause },
  dismissed: { label: 'Dismissed', color: 'text-gray-500', bg: 'bg-gray-500/10', Icon: XCircle },
  error: { label: 'Error', color: 'text-red-400', bg: 'bg-red-400/10', Icon: AlertTriangle },
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
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    incident: IncidentFull
    toolCalls: ToolCall[]
  } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)

  useEffect(() => {
    api<{ incidents: Incident[]; total: number }>(`/api/incidents?repo=${encodeURIComponent(repo)}`)
      .then((d) => {
        setIncidents(d.incidents)
        setTotal(d.total)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [repo])

  async function selectIncident(id: string) {
    if (selectedId === id) {
      setSelectedId(null)
      setDetail(null)
      return
    }
    setSelectedId(id)
    setDetailLoading(true)
    setDetailError(false)
    try {
      const data = await api<{
        incident: IncidentFull
        toolCalls: ToolCall[]
      }>(`/api/incidents/${id}`)
      setDetail(data)
    } catch {
      setDetail(null)
      setDetailError(true)
    } finally {
      setDetailLoading(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api(`/api/incidents/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
      if (detail?.incident.id === id) {
        setDetail((d) => (d ? { ...d, incident: { ...d.incident, status } } : null))
      }
    } catch {
      setError('Failed to update status')
    }
  }

  // Stats for right panel when nothing selected
  const investigating = incidents.filter((i) => i.status === 'investigating').length
  const resolved = incidents.filter((i) => i.status === 'resolved').length
  const errors = incidents.filter((i) => i.status === 'error').length

  const rightPanel = selectedId ? (
    // Incident detail panel
    detailLoading ? (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    ) : detailError || !detail ? (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400 text-center">Failed to load incident details.</p>
      </div>
    ) : (
      <DetailPanel
        detail={detail}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
        }}
        onUpdateStatus={updateStatus}
      />
    )
  ) : (
    // Stats overview
    <div className="flex flex-col gap-2 p-4 flex-1">
      <div className="text-[10px] font-bold text-[#FF4500] tracking-wider mb-2">OVERVIEW</div>
      <StatCard label="Total Incidents" value={total} />
      <StatCard label="Investigating" value={investigating} color="text-amber-400" />
      <StatCard label="Resolved" value={resolved} color="text-emerald-400" />
      <StatCard label="Errors" value={errors} color="text-red-400" />
      <div className="flex-1" />
      <div className="bg-[#21242C] p-3 rounded-xl text-xs text-gray-500 border border-white/5 leading-relaxed">
        Select an incident to view root cause analysis, suggested fixes, and agent activity.
      </div>
    </div>
  )

  return (
    <DashboardLayout repo={repo} rightPanel={rightPanel}>
      {/* Main content: incidents list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400">{error}</p>
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
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
            <div>
              <h1 className="text-lg font-semibold">Incidents</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {total} total &middot; {repo}
              </p>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {incidents.map((inc) => {
              const s = STATUS_MAP[inc.status] ?? STATUS_MAP.error
              const selected = selectedId === inc.id
              return (
                <button
                  key={inc.id}
                  onClick={() => selectIncident(inc.id)}
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{inc.workflowName}</span>
                        {inc.failedStep && (
                          <>
                            <ChevronRight className="w-3 h-3 text-gray-600 shrink-0" />
                            <span className="text-sm text-gray-400 truncate">{inc.failedStep}</span>
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

function DetailPanel({
  detail,
  onClose,
  onUpdateStatus,
}: {
  detail: { incident: IncidentFull; toolCalls: ToolCall[] }
  onClose: () => void
  onUpdateStatus: (id: string, status: string) => void
}) {
  const inc = detail.incident
  const s = STATUS_MAP[inc.status] ?? STATUS_MAP.error

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
        {/* Status + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', s.bg, s.color)}>
            <s.Icon className="w-3 h-3" />
            {s.label}
          </span>
          <div className="flex-1" />
          {inc.status !== 'resolved' && (
            <button
              onClick={() => onUpdateStatus(inc.id, 'resolved')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Resolve
            </button>
          )}
          {inc.status !== 'dismissed' && inc.status !== 'resolved' && (
            <button
              onClick={() => onUpdateStatus(inc.id, 'dismissed')}
              className="text-xs text-gray-500 hover:text-gray-300 font-medium transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>

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
            {inc.mttrSeconds !== null && <MetaCard label="MTTR" value={fmtDuration(inc.mttrSeconds)} />}
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
