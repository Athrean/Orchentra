'use client'

import { useAgentEvents } from '../../lib/hooks'
import type { AgentEventEnvelope } from '../../lib/hooks'
import { Section } from './IncidentDetailPrimitives'

interface AgentEventTimelineProps {
  incidentId: string
  /** Currently-known incident status — drives whether we show "in progress" affordances. */
  status: string
}

interface TimelineRow {
  key: string
  label: string
  detail: string | null
  status: 'pending' | 'done' | 'error'
  durationMs: number | null
  timestamp: number
}

function buildRows(events: AgentEventEnvelope[]): TimelineRow[] {
  // Pair tool_call → tool_result by tool name (best-effort).
  // Synthetic synthesis / completed / error events become standalone rows.
  const pendingCalls = new Map<string, TimelineRow>()
  const rows: TimelineRow[] = []

  for (const env of events) {
    const e = env.event
    switch (e.kind) {
      case 'agent:started':
        rows.push({
          key: `started-${env.timestamp}`,
          label: 'Investigation started',
          detail: `${e.repo} · ${e.workflow}`,
          status: 'done',
          durationMs: null,
          timestamp: env.timestamp,
        })
        break
      case 'agent:tool_call': {
        const row: TimelineRow = {
          key: `tool-${e.tool}-${env.timestamp}`,
          label: e.tool,
          detail: summarizeToolArgs(e.tool, e.args),
          status: 'pending',
          durationMs: null,
          timestamp: env.timestamp,
        }
        pendingCalls.set(e.tool, row)
        rows.push(row)
        break
      }
      case 'agent:tool_result': {
        const pending = pendingCalls.get(e.tool)
        if (pending) {
          pending.status = e.isError ? 'error' : 'done'
          pending.durationMs = e.durationMs
          pendingCalls.delete(e.tool)
        }
        break
      }
      case 'agent:synthesis':
        rows.push({
          key: `synthesis-${env.timestamp}`,
          label: 'Synthesizing brief',
          detail: null,
          status: 'pending',
          durationMs: null,
          timestamp: env.timestamp,
        })
        break
      case 'agent:completed': {
        const last = rows[rows.length - 1]
        if (last && last.label === 'Synthesizing brief') last.status = 'done'
        rows.push({
          key: `completed-${env.timestamp}`,
          label: 'Triage complete',
          detail: `${e.failureType} · ${Math.round(e.confidence * 100)}% confidence`,
          status: 'done',
          durationMs: null,
          timestamp: env.timestamp,
        })
        break
      }
      case 'agent:error':
        rows.push({
          key: `error-${env.timestamp}`,
          label: 'Investigation failed',
          detail: e.message,
          status: 'error',
          durationMs: null,
          timestamp: env.timestamp,
        })
        break
    }
  }

  return rows
}

function summarizeToolArgs(tool: string, args: Record<string, unknown>): string | null {
  if (tool === 'get_workflow_logs') return `${args.owner ?? ''}/${args.repo ?? ''} · run ${args.runId ?? '?'}`
  if (tool === 'get_pull_request') return `#${args.number ?? '?'}`
  if (tool === 'get_issue') return `#${args.number ?? '?'}`
  if (tool === 'get_commit_changes') return String(args.sha ?? '').slice(0, 8)
  if (tool === 'get_file_content') return String(args.path ?? '')
  if (tool === 'search_code') return String(args.query ?? '')
  return null
}

const STATUS_DOT: Record<TimelineRow['status'], { color: string; pulse: boolean }> = {
  pending: { color: 'var(--color-brand)', pulse: true },
  done: { color: 'var(--color-success, #16a34a)', pulse: false },
  error: { color: 'var(--color-danger, #dc2626)', pulse: false },
}

export function AgentEventTimeline({ incidentId, status }: AgentEventTimelineProps): React.ReactNode {
  const { events, isLoading } = useAgentEvents(incidentId)

  if (isLoading) return null
  if (events.length === 0) return null

  const rows = buildRows(events)
  const isLive = status === 'investigating' || status === 'queued'

  return (
    <Section title={`Investigation${isLive ? ' (live)' : ''} · ${rows.length} step${rows.length === 1 ? '' : 's'}`}>
      <div className="space-y-1">
        {rows.map((row) => {
          const dot = STATUS_DOT[row.status]
          return (
            <div
              key={row.key}
              className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-2 border"
              style={{
                background: 'var(--color-app-deep)',
                borderColor: 'var(--color-app-border)',
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot.pulse ? 'animate-pulse' : ''}`}
                style={{ background: dot.color }}
              />
              <span className="font-medium" style={{ color: 'var(--color-app-text-secondary)' }}>
                {row.label}
              </span>
              {row.detail && (
                <span className="truncate" style={{ color: 'var(--color-app-text-subtle)' }}>
                  {row.detail}
                </span>
              )}
              {row.durationMs !== null && (
                <span className="ml-auto" style={{ color: 'var(--color-app-text-subtle)' }}>
                  {row.durationMs}ms
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
