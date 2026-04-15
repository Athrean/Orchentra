'use client'

import { RotateCcw, FileText, GitPullRequest, Bell, BellOff, XCircle } from 'lucide-react'
import { Button } from '../ui/Button'

interface IncidentActionsProps {
  incidentId: string
  repo: string
  workflowRunId: number | null
  hasSuggestedFix: boolean
  canAct: boolean
  isNonTerminal: boolean
  anyActionLoading: boolean
  rerun: ReturnType<typeof import('../../lib/hooks').useRerunWorkflow>
  createIssue: ReturnType<typeof import('../../lib/hooks').useCreateIssue>
  createFixPR: ReturnType<typeof import('../../lib/hooks').useCreateFixPR>
  escalate: ReturnType<typeof import('../../lib/hooks').useEscalateIncident>
  snooze: ReturnType<typeof import('../../lib/hooks').useSnoozeIncident>
  dismiss: ReturnType<typeof import('../../lib/hooks').useDismissIncident>
  resolve: ReturnType<typeof import('../../lib/hooks').useResolveIncident>
}

export function IncidentActions({
  incidentId,
  workflowRunId,
  hasSuggestedFix,
  canAct,
  isNonTerminal,
  anyActionLoading,
  rerun,
  createIssue,
  createFixPR,
  escalate,
  snooze,
  dismiss,
  resolve,
}: IncidentActionsProps) {
  return (
    <>
      {canAct && (
        <div>
          <div
            className="text-[10px] font-semibold tracking-widest uppercase mb-2"
            style={{ color: 'var(--color-app-text-subtle)' }}
          >
            Actions
          </div>
          <div className="flex flex-wrap gap-1.5">
            {workflowRunId && (
              <Button
                variant="primary"
                size="sm"
                icon={<RotateCcw className="w-3 h-3" />}
                loading={rerun.isPending}
                disabled={anyActionLoading}
                onClick={() => rerun.mutate(incidentId)}
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
              onClick={() => createIssue.mutate(incidentId)}
            >
              Create Issue
            </Button>
            {hasSuggestedFix && (
              <Button
                variant="primary"
                size="sm"
                icon={<GitPullRequest className="w-3 h-3" />}
                loading={createFixPR.isPending}
                disabled={anyActionLoading}
                onClick={() => createFixPR.mutate(incidentId)}
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
              onClick={() => escalate.mutate(incidentId)}
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
              onClick={() => snooze.mutate({ incidentId, hours: 1 })}
            >
              Snooze 1h
            </Button>
            <Button
              variant="muted"
              size="sm"
              icon={<BellOff className="w-3 h-3" />}
              loading={snooze.isPending && snooze.variables?.hours === 4}
              disabled={anyActionLoading}
              onClick={() => snooze.mutate({ incidentId, hours: 4 })}
            >
              Snooze 4h
            </Button>
            <Button
              variant="muted"
              size="sm"
              icon={<XCircle className="w-3 h-3" />}
              loading={dismiss.isPending}
              disabled={anyActionLoading}
              onClick={() => dismiss.mutate(incidentId)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {isNonTerminal && !canAct && (
        <div className="flex gap-3">
          <button
            onClick={() => resolve.mutate(incidentId)}
            disabled={resolve.isPending}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {resolve.isPending ? 'Resolving…' : 'Resolve'}
          </button>
          <button
            onClick={() => dismiss.mutate(incidentId)}
            disabled={dismiss.isPending}
            className="text-xs font-medium transition-colors hover:text-white"
            style={{ color: 'var(--color-app-text-muted)' }}
          >
            {dismiss.isPending ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      )}
    </>
  )
}

interface MutationHook {
  error: unknown
  data: unknown
}

interface ActionFeedbackProps {
  rerun: MutationHook
  createIssue: MutationHook & { data?: { issueUrl: string; issueNumber?: number } | null }
  createFixPR: MutationHook & { data?: { prUrl: string; prNumber?: number } | null }
  escalate: MutationHook
  snooze: MutationHook
  dismiss: MutationHook
  resolve: MutationHook
}

export function ActionFeedback({
  rerun,
  createIssue,
  createFixPR,
  escalate,
  snooze,
  dismiss,
  resolve,
}: ActionFeedbackProps) {
  const hasError =
    rerun.error ||
    createIssue.error ||
    createFixPR.error ||
    escalate.error ||
    snooze.error ||
    dismiss.error ||
    resolve.error

  return (
    <>
      {hasError && (
        <div className="text-xs text-red-400 rounded-lg px-3 py-2 border border-red-500/20 bg-red-500/8">
          Action failed — please try again.
        </div>
      )}
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
    </>
  )
}
