'use client'

import { GitBranch, Clock } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { type StatusKey, STATUS_CONFIG, timeAgo, fmtDuration } from './incidents.utils'
import type { ExecutionMeta } from '../../lib/types'

/**
 * Renders the metadata strip for one execution: kind, status, started timestamp,
 * total duration, and any kind-specific bits (repo+branch for ci_failure, etc.).
 *
 * Kind-specific rendering lives ONLY here. The rest of the page consumes
 * executions through a kind-agnostic component path.
 */
export function ExecutionHeader({ execution }: { execution: ExecutionMeta }) {
  const cfg = STATUS_CONFIG[execution.status as StatusKey] ?? STATUS_CONFIG.error
  const started = execution.triggeredAt ?? execution.createdAt
  const duration = formatDuration(execution)

  return (
    <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--color-app-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <KindBadge kind={execution.kind} />
        <Badge variant={cfg.badgeVariant} icon={<cfg.Icon className="w-2.5 h-2.5" />}>
          {cfg.label}
        </Badge>
      </div>

      <h1 className="text-sm font-semibold mb-1 truncate" style={{ color: 'var(--color-app-text)' }}>
        Execution {execution.id.slice(0, 8)}
      </h1>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]"
        style={{ color: 'var(--color-app-text-muted)' }}
      >
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Started {timeAgo(started)}
        </span>
        {duration && <span>Duration {duration}</span>}
        <KindMetadata execution={execution} />
      </div>
    </div>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const variant = kindVariant(kind)
  return <Badge variant={variant}>{kind}</Badge>
}

function kindVariant(kind: string): 'brand' | 'amber' | 'blue' | 'purple' | 'muted' {
  switch (kind) {
    case 'ci_failure':
      return 'brand'
    case 'alert':
      return 'amber'
    case 'cron':
      return 'purple'
    case 'deploy':
      return 'blue'
    default:
      return 'muted'
  }
}

function KindMetadata({ execution }: { execution: ExecutionMeta }) {
  if (execution.kind === 'ci_failure') {
    return (
      <span className="inline-flex items-center gap-1 truncate">
        <GitBranch className="w-3 h-3 shrink-0" />
        <span className="truncate">
          {execution.repo}@{execution.branch}
        </span>
      </span>
    )
  }
  // Other kinds get extension points here as Phase 5 adapters land.
  return null
}

function formatDuration(execution: ExecutionMeta): string | null {
  if (execution.mttrSeconds != null) return fmtDuration(execution.mttrSeconds)
  return null
}
