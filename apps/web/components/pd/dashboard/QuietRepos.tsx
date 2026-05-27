import { Moon } from 'lucide-react'
import { formatRelative } from '../../../lib/utils'

export interface QuietRepoRow {
  repo: string
  lastActivity: Date | null
}

export function QuietRepos({ rows }: { rows: QuietRepoRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="surface p-6 text-center text-sm text-pg-text-mute">
        All tracked repos active in the last 7 days.
      </div>
    )
  }
  return (
    <div className="surface overflow-hidden">
      <ul className="divide-y divide-pg-hairline">
        {rows.map((r) => (
          <li key={r.repo} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-pg-surface-1/60">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pg-surface-1 text-pg-text-mute">
              <Moon className="h-3.5 w-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm text-pg-text-0">{r.repo}</span>
              <span className="text-xs text-pg-text-mute">
                {r.lastActivity ? `last run ${formatRelative(r.lastActivity)}` : 'no runs in window'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
