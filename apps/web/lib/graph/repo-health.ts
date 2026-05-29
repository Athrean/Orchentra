import { sql } from 'drizzle-orm'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { getInsightsForRepos, type RepoInsights } from '../github/repo-insights'
import { graphDb } from './client'
import { safeGraphRead, type ReadStatus } from './result'
import { getUsageRange, USAGE_RANGE_OPTIONS, type UsageRange } from './usage'

export { getUsageRange as getRepoHealthRange, USAGE_RANGE_OPTIONS as REPO_HEALTH_RANGE_OPTIONS }

// Repo-health is RAW stats only — workflow run counts, success rate, failures,
// last activity (from GitHub) merged with average resolve time (from the graph).
// No invented composite "health score" / traffic light: every number is real.
export interface RepoHealthRow {
  repo: string
  runs: number
  failures: number
  successes: number
  successRate: number | null
  avgDurationMs: number | null
  lastActivity: Date | null
  mttrSeconds: number | null
}

export interface RepoHealthResult {
  range: UsageRange
  subscribedRepos: string[]
  rows: RepoHealthRow[]
  needsAttention: RepoHealthRow[]
  graphStatus: ReadStatus
}

export function aggregateRepoHealthRows(insights: RepoInsights[], mttrByRepo: Map<string, number>): RepoHealthRow[] {
  return insights
    .map((insight) => {
      const durations = insight.runs.map((run) => run.durationMs).filter((d): d is number => d !== null)
      const avgDurationMs =
        durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : null
      const latest = insight.runs[0]?.createdAt
      return {
        repo: insight.repoFullName,
        runs: insight.total,
        failures: insight.failures,
        successes: insight.successes,
        successRate: insight.total > 0 ? insight.successes / insight.total : null,
        avgDurationMs,
        lastActivity: latest ? new Date(latest) : null,
        mttrSeconds: mttrByRepo.get(insight.repoFullName) ?? null,
      }
    })
    .sort((a, b) => b.runs - a.runs)
}

export function findRepositoriesNeedingAttention(rows: RepoHealthRow[], threshold = 0.8): RepoHealthRow[] {
  return rows
    .filter((row) => row.runs > 0 && row.successRate !== null && row.successRate < threshold && row.failures > 0)
    .sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1))
}

export async function getRepoHealthForUser(userId: string, range: UsageRange): Promise<RepoHealthResult> {
  const subscriptions = await getUserSubscriptions(userId)
  const subscribedRepos = subscriptions.map((subscription) => subscription.repoFullName).sort()

  if (subscribedRepos.length === 0) {
    return { range, subscribedRepos, rows: [], needsAttention: [], graphStatus: 'empty' }
  }

  const repoSql = sql.join(
    subscribedRepos.map((repo) => sql`${repo}`),
    sql`, `,
  )

  const [insights, graphResult] = await Promise.all([
    getInsightsForRepos(
      subscriptions.map((subscription) => ({
        installationId: subscription.installationId,
        repoFullName: subscription.repoFullName,
      })),
      range.from.toISOString(),
    ),
    safeGraphRead<Array<Record<string, unknown>>>('repo-health-mttr', [], async () => {
      return (await graphDb.execute(sql`
        SELECT repo, AVG(mttr_seconds)::int AS avg_mttr
        FROM executions
        WHERE repo IN (${repoSql})
          AND kind = 'ci_failure'
          AND mttr_seconds IS NOT NULL
          AND COALESCE(triggered_at, created_at) >= ${range.from.toISOString()}
        GROUP BY repo
      `)) as unknown as Array<Record<string, unknown>>
    }),
  ])

  const mttrByRepo = new Map<string, number>()
  for (const row of graphResult.data) {
    if (row.avg_mttr !== null && row.avg_mttr !== undefined) mttrByRepo.set(String(row.repo), Number(row.avg_mttr))
  }

  const rows = aggregateRepoHealthRows(insights, mttrByRepo)
  return {
    range,
    subscribedRepos,
    rows,
    needsAttention: findRepositoriesNeedingAttention(rows),
    graphStatus: graphResult.status,
  }
}
