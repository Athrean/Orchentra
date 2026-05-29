import { AlertOctagon, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export interface FailingWorkflowRow {
  repo: string
  workflow: string
  failures: number
  total: number
  installationId: number
  runId: number
  htmlUrl: string
}

export function FailingWorkflows({ rows }: { rows: FailingWorkflowRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="surface p-6 text-center text-sm text-pg-text-mute">
        No failing workflows in the last 30 days. Nice.
      </div>
    )
  }
  return (
    <div className="surface overflow-hidden">
      <ul className="divide-y divide-pg-hairline">
        {rows.map((r) => {
          const ratePct = r.total > 0 ? Math.round((r.failures / r.total) * 100) : 0
          return (
            <li
              key={`${r.repo}/${r.workflow}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-pg-surface-1/60"
            >
              <Link
                href={`/traces/${r.installationId}/${r.repo}/${r.runId}`}
                className="flex min-w-0 flex-1 items-center gap-4 transition-opacity hover:opacity-80"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
                  <AlertOctagon className="h-3.5 w-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-pg-text-0">{r.workflow}</span>
                  <span className="truncate text-xs text-pg-text-mute">{r.repo}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-right">
                  <span className="text-sm font-medium text-red-600">{ratePct}%</span>
                  <span className="text-xs text-pg-text-mute">
                    {r.failures}/{r.total} runs
                  </span>
                </div>
              </Link>
              <a
                href={r.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pg-text-mute transition-colors hover:text-pg-text-0"
                aria-label="Open on GitHub"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
