import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Activity, Coins, Database, Sigma } from 'lucide-react'
import { createClient } from '../../../lib/supabase/server'
import { cn } from '../../../lib/utils'
import { getUsageForUser, getUsageRange, USAGE_RANGE_OPTIONS } from '../../../lib/graph/usage'
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
  const usage = await getUsageForUser(user.id, range)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pb-12 pt-8 sm:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-pg-text-0">Usage</h1>
          <p className="mt-1 text-sm text-pg-text-mute">Token and cost totals for subscribed repositories.</p>
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

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile icon={Sigma} label="Total tokens" value={usage.summary.totalTokens.toLocaleString()} />
        <MetricTile icon={Activity} label="Input tokens" value={usage.summary.totalInputTokens.toLocaleString()} />
        <MetricTile icon={Database} label="Output tokens" value={usage.summary.totalOutputTokens.toLocaleString()} />
        <MetricTile icon={Coins} label="Estimated cost" value={`$${usage.summary.totalEstimatedCostUsd.toFixed(4)}`} />
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
