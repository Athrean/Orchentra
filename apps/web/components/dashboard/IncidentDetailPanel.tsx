'use client'

import { Loader2, X, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import {
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
import { useSummarize } from '../../lib/hooks/useSummarize'
import { type StatusKey, STATUS_CONFIG } from './incidents.utils'
import { IncidentActions, ActionFeedback } from './IncidentActions'
import { IncidentDetailBody } from './IncidentDetailBody'

export function DetailPanel({ incidentId, repo, onClose }: { incidentId: string; repo: string; onClose: () => void }) {
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
  const isNonTerminal = inc.status !== 'resolved' && inc.status !== 'dismissed'

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
        <Badge variant={cfg.badgeVariant} icon={<cfg.Icon className="w-2.5 h-2.5" />}>
          {cfg.label}
        </Badge>

        <SummarySection
          summary={summary}
          isSummarizing={isSummarizing}
          summaryError={summaryError}
          summarize={summarize}
        />

        <IncidentActions
          incidentId={inc.id}
          workflowRunId={inc.workflowRunId}
          hasSuggestedFix={!!inc.suggestedFix}
          canAct={canAct}
          isNonTerminal={isNonTerminal}
          anyActionLoading={anyActionLoading}
          rerun={rerun}
          createIssue={createIssue}
          createFixPR={createFixPR}
          escalate={escalate}
          snooze={snooze}
          dismiss={dismiss}
          resolve={resolve}
        />

        <ActionFeedback
          rerun={rerun}
          createIssue={createIssue}
          createFixPR={createFixPR}
          escalate={escalate}
          snooze={snooze}
          dismiss={dismiss}
          resolve={resolve}
        />

        <IncidentDetailBody inc={inc} toolCalls={detail.toolCalls} />
      </div>
    </div>
  )
}

function SummarySection({
  summary,
  isSummarizing,
  summaryError,
  summarize,
}: {
  summary: string
  isSummarizing: boolean
  summaryError: boolean
  summarize: () => void
}) {
  if (!summary && !isSummarizing && !summaryError) {
    return (
      <div>
        <Button variant="primary" size="sm" icon={<Sparkles className="w-3 h-3" />} onClick={summarize}>
          Summarize
        </Button>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: 'var(--color-app-deep)',
        borderColor: 'var(--color-app-border)',
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3 h-3" style={{ color: 'var(--color-brand)' }} />
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-brand)' }}>
          AI Summary
        </span>
        {isSummarizing && (
          <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: 'var(--color-app-text-subtle)' }} />
        )}
      </div>
      {summaryError ? (
        <p className="text-xs text-red-400">
          Failed to generate summary.{' '}
          <button onClick={summarize} className="underline hover:text-red-300">
            Retry
          </button>
        </p>
      ) : (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-secondary)' }}>
          {summary || 'Generating...'}
        </p>
      )}
    </div>
  )
}
