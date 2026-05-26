import { AlertOctagon, CheckCircle2, Clock, Zap } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { getUserSubscriptions } from '../../../lib/db/queries/subscriptions'
import {
  aggregateInsights,
  getInsightsForRepos,
  type RepoInsights,
  type WorkflowRunSummary,
} from '../../../lib/github/repo-insights'
import { StatTile } from '../../../components/pd/dashboard/StatTile'
import { ExecutionsLineChart, type ExecutionsPoint } from '../../../components/pd/dashboard/charts/ExecutionsLineChart'
import { MttrBarChart, type MttrPoint } from '../../../components/pd/dashboard/charts/MttrBarChart'
import {
  type ActivityRow,
  type ActivityStatus,
  RecentActivityTable,
} from '../../../components/pd/dashboard/RecentActivityTable'
import { DashboardEmptyState } from '../../../components/pd/dashboard/EmptyState'
import { FailingWorkflows, type FailingWorkflowRow } from '../../../components/pd/dashboard/FailingWorkflows'
import { QuietRepos, type QuietRepoRow } from '../../../components/pd/dashboard/QuietRepos'

export const metadata = { title: 'Overview · Orchentra' }
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function buildLineSeries(runs: WorkflowRunSummary[], windowDays: number): ExecutionsPoint[] {
  const buckets = new Map<string, number>()
  const today = startOfDayUtc(new Date())
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const day = new Date(today.getTime() - i * DAY_MS)
    const key = day.toISOString().slice(5, 10)
    buckets.set(key, 0)
  }
  for (const r of runs) {
    const key = r.createdAt.slice(5, 10)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }))
}

function buildMttrSeries(runs: WorkflowRunSummary[]): MttrPoint[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const buckets: Array<{ sum: number; n: number }> = labels.map(() => ({ sum: 0, n: 0 }))
  for (const r of runs) {
    if (r.conclusion !== 'failure' || r.durationMs === null) continue
    const dow = (new Date(r.createdAt).getUTCDay() + 6) % 7
    buckets[dow].sum += r.durationMs
    buckets[dow].n += 1
  }
  return labels.map((day, i) => {
    const b = buckets[i]
    return { day, mttr: b.n > 0 ? Math.round(b.sum / b.n / 60_000) : 0 }
  })
}

function conclusionToStatus(conclusion: string | null, status: string): ActivityStatus {
  if (status === 'in_progress' || status === 'queued' || status === 'waiting') return 'queued'
  if (conclusion === 'success') return 'fixed'
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled') return 'failed'
  return 'investigating'
}

function topRuns(insights: RepoInsights[], n: number): WorkflowRunSummary[] {
  const all = insights.flatMap((i) => i.runs)
  return all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, n)
}

function topFailingWorkflows(
  insights: RepoInsights[],
  instByRepo: Map<string, number>,
  n: number,
): FailingWorkflowRow[] {
  type Stat = FailingWorkflowRow & { latestFailAt: number }
  const stats = new Map<string, Stat>()
  for (const ins of insights) {
    for (const run of ins.runs) {
      const key = `${run.repoFullName}::${run.name}`
      const existing: Stat = stats.get(key) ?? {
        repo: run.repoFullName,
        workflow: run.name,
        failures: 0,
        total: 0,
        installationId: instByRepo.get(run.repoFullName) ?? 0,
        runId: run.id,
        htmlUrl: run.htmlUrl,
        latestFailAt: 0,
      }
      existing.total += 1
      if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
        existing.failures += 1
        const at = Date.parse(run.createdAt)
        if (at >= existing.latestFailAt) {
          existing.latestFailAt = at
          existing.runId = run.id
          existing.htmlUrl = run.htmlUrl
        }
      }
      stats.set(key, existing)
    }
  }
  return Array.from(stats.values())
    .filter((s) => s.failures > 0 && s.total >= 3)
    .sort((a, b) => b.failures / b.total - a.failures / a.total)
    .slice(0, n)
    .map((s) => ({
      repo: s.repo,
      workflow: s.workflow,
      failures: s.failures,
      total: s.total,
      installationId: s.installationId,
      runId: s.runId,
      htmlUrl: s.htmlUrl,
    }))
}

function quietRepos(insights: RepoInsights[], thresholdMs: number): QuietRepoRow[] {
  const now = Date.now()
  return insights
    .map((ins) => {
      const last = ins.runs[0] ? Date.parse(ins.runs[0].createdAt) : null
      return { repo: ins.repoFullName, lastActivity: last ? new Date(last) : null, lastMs: last }
    })
    .filter((r) => r.lastMs === null || now - r.lastMs > thresholdMs)
    .sort((a, b) => (a.lastMs ?? 0) - (b.lastMs ?? 0))
    .slice(0, 5)
    .map(({ repo, lastActivity }) => ({ repo, lastActivity }))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const subs = await getUserSubscriptions(user.id)
  if (subs.length === 0) {
    return <DashboardEmptyState />
  }

  const since = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const insights = await getInsightsForRepos(
    subs.map((s) => ({ installationId: s.installationId, repoFullName: s.repoFullName })),
    since,
  )

  const allRuns = insights.flatMap((i) => i.runs)
  const agg = aggregateInsights(insights)
  const lineSeries = buildLineSeries(allRuns, 30)
  const mttrSeries = buildMttrSeries(allRuns)
  const recent = topRuns(insights, 20)
  const instByRepo = new Map(subs.map((s) => [s.repoFullName, s.installationId]))

  const rows: ActivityRow[] = recent.map((r) => ({
    id: String(r.id),
    installationId: instByRepo.get(r.repoFullName) ?? 0,
    repo: r.repoFullName,
    workflow: r.name,
    status: conclusionToStatus(r.conclusion, r.status),
    triggeredAt: new Date(r.createdAt),
    durationSec: r.durationMs ? Math.round(r.durationMs / 1000) : undefined,
  }))

  const successPct = agg.successRate !== null ? Math.round(agg.successRate * 100) : null
  const avgDurMin = agg.avgDurationMs !== null ? Math.round(agg.avgDurationMs / 60_000) : null
  const failingWorkflows = topFailingWorkflows(insights, instByRepo, 5)
  const quietRows = quietRepos(insights, 7 * DAY_MS)

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile title="Workflow runs (30d)" value={String(agg.totalRuns)} filter="30 days" icon={Zap}>
          <ExecutionsLineChart data={lineSeries} />
        </StatTile>
        <StatTile title="Failures (30d)" value={String(agg.totalFailures)} filter="30 days" icon={AlertOctagon}>
          <MttrBarChart data={mttrSeries} />
        </StatTile>
        <StatTile
          title="Success rate"
          value={successPct !== null ? `${successPct}%` : '—'}
          filter="30 days"
          icon={CheckCircle2}
        >
          <div className="flex h-full flex-col justify-end gap-2 text-xs text-light/60">
            <span>
              {agg.totalSuccesses} of {agg.totalRuns} runs
            </span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-[var(--color-pg-accent-green-2)] transition-all"
                style={{ width: `${successPct ?? 0}%` }}
              />
            </div>
          </div>
        </StatTile>
        <StatTile title="Avg duration" value={avgDurMin !== null ? `${avgDurMin}m` : '—'} filter="30 days" icon={Clock}>
          <div className="flex h-full flex-col justify-end gap-1 text-xs text-light/60">
            <span>{subs.length} repos tracked</span>
            <span className="text-light/40">Across {agg.totalRuns} runs</span>
          </div>
        </StatTile>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-light/60">Failing workflows</h2>
          <FailingWorkflows rows={failingWorkflows} />
        </div>
        <div>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-light/60">Quiet repos</h2>
          <QuietRepos rows={quietRows} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-light/60">Recent activity</h2>
        <RecentActivityTable rows={rows} />
      </div>
    </div>
  )
}
