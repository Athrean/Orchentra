import { sql, and, eq, gte, lte, desc } from 'drizzle-orm'
import { db, incidents } from '../db/client'

export interface DailyFailureRate {
  date: string // YYYY-MM-DD
  total: number
  failed: number
  failureRate: number // 0-1
}

export interface MttrByWorkflow {
  workflowName: string
  avgMttrSeconds: number
  incidentCount: number
}

export interface TopFailingWorkflow {
  workflowName: string
  failureCount: number
  repo: string
}

export interface FailedStepFrequency {
  failedStep: string
  count: number
}

export interface AnalyticsResult {
  /** Daily failure rate time series for the period. */
  dailyFailureRate: DailyFailureRate[]
  /** MTTR by workflow (only resolved incidents with mttrSeconds). */
  mttrByWorkflow: MttrByWorkflow[]
  /** Top 5 most-failing workflows across all repos. */
  topFailingWorkflows: TopFailingWorkflow[]
  /** Most common failed steps (flaky test / step detection). */
  topFailedSteps: FailedStepFrequency[]
  /** Summary counts for the period. */
  summary: {
    totalIncidents: number
    resolvedIncidents: number
    avgConfidence: number | null
    resolutionRate: number | null
  }
}

/**
 * Run all analytics aggregations for an org in parallel.
 * All queries are scoped to the given org and date range.
 */
export async function getAnalytics(
  orgId: string,
  repo: string | undefined,
  fromDate: Date,
  toDate: Date,
): Promise<AnalyticsResult> {
  const baseConditions = [
    eq(incidents.orgId, orgId),
    gte(incidents.triggeredAt, fromDate),
    lte(incidents.triggeredAt, toDate),
  ]
  if (repo) baseConditions.push(eq(incidents.repo, repo))

  const whereClause = and(...baseConditions)

  const [dailyRows, mttrRows, topWorkflowRows, stepRows, summaryRows] = await Promise.all([
    // Daily failure rate — group by calendar date
    db.execute(sql`
      SELECT
        DATE(triggered_at AT TIME ZONE 'UTC') AS date,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('investigating', 'brief_ready', 'fixing', 'escalated', 'error')) AS failed
      FROM incidents
      WHERE org_id = ${orgId}
        ${repo ? sql`AND repo = ${repo}` : sql``}
        AND triggered_at >= ${fromDate}
        AND triggered_at <= ${toDate}
      GROUP BY DATE(triggered_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `),

    // Avg MTTR per workflow (resolved incidents only)
    db.execute(sql`
      SELECT
        workflow_name,
        AVG(mttr_seconds) AS avg_mttr_seconds,
        COUNT(*) AS incident_count
      FROM incidents
      WHERE org_id = ${orgId}
        ${repo ? sql`AND repo = ${repo}` : sql``}
        AND triggered_at >= ${fromDate}
        AND triggered_at <= ${toDate}
        AND status = 'resolved'
        AND mttr_seconds IS NOT NULL
      GROUP BY workflow_name
      ORDER BY avg_mttr_seconds DESC
      LIMIT 10
    `),

    // Top failing workflows
    db
      .select({
        workflowName: incidents.workflowName,
        repo: incidents.repo,
        failureCount: sql<number>`COUNT(*)`,
      })
      .from(incidents)
      .where(whereClause)
      .groupBy(incidents.workflowName, incidents.repo)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5),

    // Most common failed steps
    db
      .select({
        failedStep: incidents.failedStep,
        count: sql<number>`COUNT(*)`,
      })
      .from(incidents)
      .where(and(whereClause, sql`failed_step IS NOT NULL`))
      .groupBy(incidents.failedStep)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),

    // Summary
    db.execute(sql`
      SELECT
        COUNT(*) AS total_incidents,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_incidents,
        AVG(confidence) AS avg_confidence
      FROM incidents
      WHERE org_id = ${orgId}
        ${repo ? sql`AND repo = ${repo}` : sql``}
        AND triggered_at >= ${fromDate}
        AND triggered_at <= ${toDate}
    `),
  ])

  const daily: DailyFailureRate[] = (dailyRows as unknown as Record<string, unknown>[]).map((r) => {
    const total = Number(r.total)
    const failed = Number(r.failed)
    return {
      date: String(r.date).slice(0, 10),
      total,
      failed,
      failureRate: total > 0 ? failed / total : 0,
    }
  })

  const mttr: MttrByWorkflow[] = (mttrRows as unknown as Record<string, unknown>[]).map((r) => ({
    workflowName: String(r.workflow_name),
    avgMttrSeconds: Math.round(Number(r.avg_mttr_seconds)),
    incidentCount: Number(r.incident_count),
  }))

  const topWorkflows: TopFailingWorkflow[] = topWorkflowRows.map((r) => ({
    workflowName: r.workflowName,
    repo: r.repo,
    failureCount: Number(r.failureCount),
  }))

  const topSteps: FailedStepFrequency[] = stepRows
    .filter((r) => r.failedStep !== null)
    .map((r) => ({
      failedStep: r.failedStep as string,
      count: Number(r.count),
    }))

  const summaryRow = (summaryRows as unknown as Record<string, unknown>[])[0] ?? {}
  const totalIncidents = Number(summaryRow.total_incidents ?? 0)
  const resolvedIncidents = Number(summaryRow.resolved_incidents ?? 0)
  const avgConfidence = summaryRow.avg_confidence != null ? Number(summaryRow.avg_confidence) : null

  return {
    dailyFailureRate: daily,
    mttrByWorkflow: mttr,
    topFailingWorkflows: topWorkflows,
    topFailedSteps: topSteps,
    summary: {
      totalIncidents,
      resolvedIncidents,
      avgConfidence,
      resolutionRate: totalIncidents > 0 ? resolvedIncidents / totalIncidents : null,
    },
  }
}
