'use client'

import { useState } from 'react'
import {
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useWorkflows,
  useWorkflowRuns,
  useTriggerWorkflow,
  useCancelRun,
  type WorkflowSummary,
  type WorkflowRun,
} from '../../lib/hooks'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ── Status badge ─────────────────────────────────────────────────────────────

type Status = 'success' | 'failure' | 'in_progress' | 'cancelled' | 'skipped' | null

function statusDot(conclusion: Status): React.ReactElement {
  if (conclusion === 'success') return <CheckCircle2 className="w-3 h-3 shrink-0" style={{ color: '#22c55e' }} />
  if (conclusion === 'failure') return <XCircle className="w-3 h-3 shrink-0" style={{ color: '#ef4444' }} />
  if (conclusion === 'in_progress')
    return <Loader2 className="w-3 h-3 shrink-0 animate-spin" style={{ color: '#f59e0b' }} />
  return <Clock className="w-3 h-3 shrink-0" style={{ color: 'var(--color-app-text-subtle)' }} />
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({ run, repo }: { run: WorkflowRun; repo: string }): React.ReactElement {
  const cancel = useCancelRun(repo)
  const isInProgress = run.status === 'in_progress' || run.status === 'queued'

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
      style={{ borderColor: 'var(--color-app-border)' }}
    >
      {statusDot(run.conclusion as Status)}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] truncate" style={{ color: 'var(--color-app-text)' }}>
          #{run.runNumber} {run.headBranch ?? run.headSha.slice(0, 7)}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
          {formatRelative(run.createdAt)} · {formatDuration(run.durationSeconds)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <a href={run.htmlUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="w-3 h-3" style={{ color: 'var(--color-app-text-subtle)' }} />
        </a>
        {isInProgress && (
          <button
            onClick={() => cancel.mutate(run.id)}
            disabled={cancel.isPending}
            className="transition-opacity disabled:opacity-40"
            title="Cancel run"
          >
            <Square className="w-3 h-3" style={{ color: '#ef4444' }} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Workflow row ──────────────────────────────────────────────────────────────

function WorkflowRow({ wf, repo }: { wf: WorkflowSummary; repo: string }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [triggerRef, setTriggerRef] = useState('')
  const [showDispatch, setShowDispatch] = useState(false)

  const { data: runs, isLoading: runsLoading } = useWorkflowRuns(repo, expanded ? wf.id : null)
  const trigger = useTriggerWorkflow(repo)

  function handleDispatch(): void {
    if (!triggerRef.trim()) return
    trigger.mutate({ workflowId: wf.id, ref: triggerRef.trim() })
    setShowDispatch(false)
    setTriggerRef('')
  }

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--color-app-border)' }}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/2 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {statusDot(wf.latestConclusion as Status)}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
            {wf.name}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--color-app-text-subtle)' }}>
            {wf.path.replace('.github/workflows/', '')}
            {wf.latestRunAt ? ` · ${formatRelative(wf.latestRunAt)}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowDispatch((s) => !s)
            }}
            className="transition-opacity hover:opacity-70"
            title="Trigger workflow"
          >
            <Play className="w-3 h-3" style={{ color: 'var(--color-brand)' }} />
          </button>
          {expanded ? (
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--color-app-text-subtle)' }} />
          ) : (
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--color-app-text-subtle)' }} />
          )}
        </div>
      </div>

      {/* Dispatch input */}
      {showDispatch && (
        <div
          className="px-3 pb-2 flex gap-2 items-center border-t"
          style={{ borderColor: 'var(--color-app-border)', background: 'var(--color-app-deep)' }}
        >
          <input
            value={triggerRef}
            onChange={(e) => setTriggerRef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDispatch()}
            placeholder="Branch or tag (e.g. main)"
            className="flex-1 bg-transparent text-[11px] outline-none py-1.5"
            style={{ color: 'var(--color-app-text)' }}
            autoFocus
          />
          <button
            onClick={handleDispatch}
            disabled={!triggerRef.trim() || trigger.isPending}
            className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40 transition-colors"
            style={{ background: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
          >
            {trigger.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Run'}
          </button>
        </div>
      )}

      {/* Runs list */}
      {expanded && (
        <div style={{ background: 'var(--color-app-deep)' }}>
          {runsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
            </div>
          ) : runs && runs.length > 0 ? (
            runs.slice(0, 8).map((run) => <RunRow key={run.id} run={run} repo={repo} />)
          ) : (
            <div className="px-3 py-3 text-[11px] text-center" style={{ color: 'var(--color-app-text-subtle)' }}>
              No runs found
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── WorkflowsTab ──────────────────────────────────────────────────────────────

export function WorkflowsTab({ repo }: { repo: string }): React.ReactElement {
  const { data: workflows, isLoading, refetch, isFetching } = useWorkflows(repo)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b shrink-0 flex items-center justify-between"
        style={{ borderColor: 'var(--color-app-border)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--color-app-text)' }}>
          Workflows
        </span>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="transition-opacity disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')}
            style={{ color: 'var(--color-app-text-muted)' }}
          />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-app-text-subtle)' }} />
          </div>
        ) : !workflows || workflows.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: 'var(--color-app-text-muted)' }}
          >
            No workflows found
          </div>
        ) : (
          workflows.map((wf) => <WorkflowRow key={wf.id} wf={wf} repo={repo} />)
        )}
      </div>
    </div>
  )
}
