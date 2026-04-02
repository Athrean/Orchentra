import { sql } from 'drizzle-orm'
import { db } from '../db/client'

export interface TokenUsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalEstimatedCostUsd: number
  incidentsWithUsage: number
  avgTokensPerIncident: number
}

export interface TokenUsageByDay {
  date: string
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface TokenUsageResult {
  summary: TokenUsageSummary
  byDay: TokenUsageByDay[]
}

/**
 * Aggregate token usage metrics for an org over a date range.
 */
export async function getTokenUsage(
  orgId: string,
  fromDate: Date,
  toDate: Date,
  repo?: string,
): Promise<TokenUsageResult> {
  const repoFilter = repo ? sql`AND repo = ${repo}` : sql``

  const [summaryRows, dailyRows] = await Promise.all([
    db.execute(sql`
      SELECT
        COALESCE(SUM(token_inputs), 0)          AS total_input_tokens,
        COALESCE(SUM(token_outputs), 0)         AS total_output_tokens,
        COALESCE(SUM(token_inputs + token_outputs), 0) AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)    AS total_estimated_cost_usd,
        COUNT(*) FILTER (WHERE token_inputs IS NOT NULL) AS incidents_with_usage,
        COALESCE(
          AVG(token_inputs + token_outputs) FILTER (WHERE token_inputs IS NOT NULL),
          0
        ) AS avg_tokens_per_incident
      FROM incidents
      WHERE org_id = ${orgId}
        ${repoFilter}
        AND triggered_at >= ${fromDate}
        AND triggered_at <= ${toDate}
    `),

    db.execute(sql`
      SELECT
        DATE(triggered_at AT TIME ZONE 'UTC') AS date,
        COALESCE(SUM(token_inputs), 0)         AS input_tokens,
        COALESCE(SUM(token_outputs), 0)        AS output_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)   AS estimated_cost_usd
      FROM incidents
      WHERE org_id = ${orgId}
        ${repoFilter}
        AND triggered_at >= ${fromDate}
        AND triggered_at <= ${toDate}
        AND token_inputs IS NOT NULL
      GROUP BY DATE(triggered_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `),
  ])

  const s = (summaryRows as unknown as Record<string, unknown>[])[0] ?? {}
  const summary: TokenUsageSummary = {
    totalInputTokens: Number(s.total_input_tokens ?? 0),
    totalOutputTokens: Number(s.total_output_tokens ?? 0),
    totalTokens: Number(s.total_tokens ?? 0),
    totalEstimatedCostUsd: Number(s.total_estimated_cost_usd ?? 0),
    incidentsWithUsage: Number(s.incidents_with_usage ?? 0),
    avgTokensPerIncident: Math.round(Number(s.avg_tokens_per_incident ?? 0)),
  }

  const byDay: TokenUsageByDay[] = (dailyRows as unknown as Record<string, unknown>[]).map((r) => ({
    date: String(r.date).slice(0, 10),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    estimatedCostUsd: Number(r.estimated_cost_usd),
  }))

  return { summary, byDay }
}
