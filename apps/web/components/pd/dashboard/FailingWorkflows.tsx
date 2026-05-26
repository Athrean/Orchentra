import { AlertOctagon, ExternalLink } from 'lucide-react'

export interface FailingWorkflowRow {
  repo: string
  workflow: string
  failures: number
  total: number
  htmlUrl: string
}

export function FailingWorkflows({ rows }: { rows: FailingWorkflowRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[8px] border border-neutral-800 bg-darker p-6 text-center text-sm text-light/45">
        No failing workflows in the last 30 days. Nice.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[8px] border border-neutral-800 bg-darker">
      <ul className="divide-y divide-neutral-800">
        {rows.map((r) => {
          const ratePct = r.total > 0 ? Math.round((r.failures / r.total) * 100) : 0
          return (
            <li key={`${r.repo}/${r.workflow}`} className="flex items-center gap-4 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-400/10 text-red-400">
                <AlertOctagon className="h-3.5 w-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-light">{r.workflow}</span>
                <span className="truncate text-xs text-light/55">{r.repo}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-sm font-medium text-red-400">{ratePct}%</span>
                <span className="text-xs text-light/45">
                  {r.failures}/{r.total} runs
                </span>
              </div>
              <a
                href={r.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-light/40 transition-colors hover:text-light"
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
