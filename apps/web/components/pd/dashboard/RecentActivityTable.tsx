import Link from 'next/link'
import { cn, formatRelative } from '../../../lib/utils'

export type ActivityStatus = 'investigating' | 'fixed' | 'failed' | 'queued'

export interface ActivityRow {
  id: string
  installationId: number
  repo: string
  workflow: string
  status: ActivityStatus
  triggeredAt: Date
  durationSec?: number
  costUsd?: number
}

interface Props {
  rows: ActivityRow[]
}

const STATUS_STYLES: Record<ActivityStatus, string> = {
  investigating: 'text-amber-700 bg-amber-500/10',
  fixed: 'text-emerald-700 bg-emerald-500/10',
  failed: 'text-red-600 bg-red-500/10',
  queued: 'text-pg-text-mute bg-pg-surface-2',
}

const COLUMNS = ['Repo', 'Workflow', 'Status', 'Triggered', 'Duration', 'Cost'] as const

function formatDuration(sec: number | undefined): string {
  if (sec === undefined) return '—'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem === 0 ? `${min}m` : `${min}m ${rem}s`
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '—'
  return `$${cost.toFixed(4)}`
}

export function RecentActivityTable({ rows }: Props) {
  return (
    <div className="surface overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-pg-text-mute"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="py-16 text-center text-sm text-pg-text-mute">
                Connect a repo at /account to start ingesting workflow runs.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={row.id}
                className={cn(
                  'text-sm tracking-wide text-pg-text-0 transition-colors hover:bg-pg-surface-1/60',
                  idx < rows.length - 1 && 'border-b border-pg-hairline',
                )}
              >
                <td className="px-4 py-3">{row.repo}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/runs/${row.installationId}/${row.repo}/${row.id}`}
                    className="text-pg-text-mute transition-colors hover:text-pg-text-0"
                  >
                    {row.workflow}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('rounded-[3px] px-2 py-0.5 text-xs', STATUS_STYLES[row.status])}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-pg-text-mute">{formatRelative(row.triggeredAt)}</td>
                <td className="px-4 py-3 text-pg-text-mute">{formatDuration(row.durationSec)}</td>
                <td className="px-4 py-3 text-pg-text-mute">{formatCost(row.costUsd)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
