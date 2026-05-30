import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, AlertTriangle, Coins, Database, GaugeCircle, Sigma, Timer } from 'lucide-react'
import { createClient } from '../../../lib/supabase/server'
import { cn } from '../../../lib/utils'
import { getUsageForUser, getUsageRange, USAGE_RANGE_OPTIONS } from '../../../lib/graph/usage'
import { getRepoHealthForUser, type RepoHealthRow } from '../../../lib/graph/repo-health'
import { UsageDayChart } from '../../../components/pd/usage/UsageDayChart'

export const metadata = { title: 'Usage · Orchentra' }
export const dynamic = 'force-dynamic'

interface UsagePageProps {
  searchParams?: Promise<{ range?: string }>
}

export default async function UsagePage({ searchParams }: UsagePageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const range = getUsageRange(params?.range)
  const [usage, health] = await Promise.all([getUsageForUser(user.id, range), getRepoHealthForUser(user.id, range)])
  const activeRepos = health.rows.filter((row) => row.runs > 0).length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-12 pt-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Usage</h1>
          <p className="mt-1 text-sm text-pg-text-mute">
            Repository health, workflow workload, and AI token spend for subscribed repositories.
          </p>
        </div>
        <div className="flex rounded-[8px] bg-white p-1 shadow-[0_0_0_1px_rgba(20,20,18,0.06)]">
          {USAGE_RANGE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/usage?range=${option.value}`}
              className={cn(
                'rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors',
                usage.range.value === option.value
                  ? 'bg-pg-text-0 text-white'
                  : 'text-pg-text-mute hover:bg-pg-surface-1 hover:text-pg-text-0',
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </header>

      <RepoHealthSection rows={health.rows} needsAttention={health.needsAttention} activeRepos={activeRepos} />

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">AI token usage</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <MetricTile icon={Sigma} label="Total tokens" value={usage.summary.totalTokens.toLocaleString()} />
          <MetricTile icon={Activity} label="Input tokens" value={usage.summary.totalInputTokens.toLocaleString()} />
          <MetricTile icon={Database} label="Output tokens" value={usage.summary.totalOutputTokens.toLocaleString()} />
          <MetricTile
            icon={Coins}
            label="Estimated cost"
            value={`$${usage.summary.totalEstimatedCostUsd.toFixed(4)}`}
          />
        </div>
      </div>

      <section className="surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-pg-text-0">Daily breakdown</h2>
            <p className="mt-1 text-xs text-pg-text-mute">
              {formatDate(usage.range.from)} to {formatDate(usage.range.to)}
            </p>
          </div>
          <span className="text-xs text-pg-text-mute">{usage.subscribedRepos.length} repos scoped</span>
        </div>
        <UsageDayChart data={usage.byDay} />
      </section>

      <section className="surface overflow-hidden">
        <div className="border-b border-pg-hairline px-5 py-4">
          <h2 className="text-sm font-medium text-pg-text-0">Repo and model</h2>
          <p className="mt-1 text-xs text-pg-text-mute">Cost is summed from persisted execution estimates.</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Repo', 'Model', 'Executions', 'Tokens', 'Cost'].map((column) => (
                <th
                  key={column}
                  className="border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-pg-text-mute"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usage.byRepoModel.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-sm text-pg-text-mute">
                  No usage recorded for subscribed repos in this range.
                </td>
              </tr>
            ) : (
              usage.byRepoModel.map((row) => (
                <tr key={`${row.repo}:${row.model}`} className="border-b border-pg-hairline text-sm last:border-b-0">
                  <td className="px-4 py-3 text-pg-text-0">{row.repo}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{row.model}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{row.executions}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{row.totalTokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-pg-text-mute">${row.estimatedCostUsd.toFixed(4)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function RepoHealthSection({
  rows,
  needsAttention,
  activeRepos,
}: {
  rows: RepoHealthRow[]
  needsAttention: RepoHealthRow[]
  activeRepos: number
}) {
  const totalRuns = rows.reduce((sum, row) => sum + row.runs, 0)
  const totalFailures = rows.reduce((sum, row) => sum + row.failures, 0)
  const overallRate = totalRuns > 0 ? Math.round(((totalRuns - totalFailures) / totalRuns) * 100) : null

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-pg-text-mute">Repository health</h2>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile icon={GaugeCircle} label="Active repos" value={String(activeRepos)} />
        <MetricTile icon={Activity} label="Workflow runs" value={totalRuns.toLocaleString()} />
        <MetricTile icon={Timer} label="Failures" value={totalFailures.toLocaleString()} />
        <MetricTile
          icon={AlertTriangle}
          label="Overall success"
          value={overallRate === null ? '—' : `${overallRate}%`}
        />
      </div>

      {needsAttention.length > 0 && (
        <div className="surface border-l-2 border-amber-500/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-pg-text-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Repos needing attention
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {needsAttention.map((row) => (
              <span key={row.repo} className="inset-chip px-2.5 py-1 text-xs text-pg-text-mute">
                {row.repo} · {Math.round((row.successRate ?? 0) * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="surface overflow-hidden">
        <div className="border-b border-pg-hairline px-5 py-4">
          <h3 className="text-sm font-medium text-pg-text-0">Per-repository workload</h3>
          <p className="mt-1 text-xs text-pg-text-mute">Workflow activity and resolve time, busiest first.</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Repo', 'Runs', 'Success', 'Failures', 'Avg MTTR', 'Last activity'].map((column) => (
                <th
                  key={column}
                  className="border-b border-pg-hairline bg-pg-surface-1/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-pg-text-mute"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-pg-text-mute">
                  No workflow activity for subscribed repos in this range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.repo} className="border-b border-pg-hairline text-sm last:border-b-0">
                  <td className="px-4 py-3 text-pg-text-0">{row.repo}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{row.runs}</td>
                  <td className="px-4 py-3 text-pg-text-mute">
                    {row.successRate === null ? '—' : `${Math.round(row.successRate * 100)}%`}
                  </td>
                  <td className="px-4 py-3 text-pg-text-mute">{row.failures}</td>
                  <td className="px-4 py-3 text-pg-text-mute">{formatMttr(row.mttrSeconds)}</td>
                  <td className="px-4 py-3 text-pg-text-mute">
                    {row.lastActivity ? row.lastActivity.toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function formatMttr(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="surface flex min-h-[112px] flex-col justify-between p-4">
      <div className="flex items-center gap-2 text-sm text-pg-text-mute">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-pg-text-0">{value}</div>
    </div>
  )
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
}
