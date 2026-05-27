import { sql } from 'drizzle-orm'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { graphDb } from './client'

export const USAGE_RANGE_OPTIONS = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
] as const

export type UsageRangeValue = (typeof USAGE_RANGE_OPTIONS)[number]['value']

export interface UsageRange {
  value: UsageRangeValue
  from: Date
  to: Date
}

export interface UsageSourceRow {
  id: string
  repo: string
  modelId: string | null
  occurredAt: Date
  tokenInputs: number | null
  tokenOutputs: number | null
  estimatedCostUsd: number | null
}

export interface UsageDay {
  day: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export interface UsageRepoModel {
  repo: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  executions: number
}

export interface UsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalEstimatedCostUsd: number
  executionsWithUsage: number
}

export interface UsageResult {
  range: UsageRange
  subscribedRepos: string[]
  summary: UsageSummary
  byDay: UsageDay[]
  byRepoModel: UsageRepoModel[]
}

export function getUsageRange(value: string | undefined, now = new Date()): UsageRange {
  const option = USAGE_RANGE_OPTIONS.find((item) => item.value === value) ?? USAGE_RANGE_OPTIONS[1]
  const to = new Date(now)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - option.days + 1)
  from.setUTCHours(0, 0, 0, 0)
  return { value: option.value, from, to }
}

export async function getUsageForUser(userId: string, range: UsageRange): Promise<UsageResult> {
  const subscriptions = await getUserSubscriptions(userId)
  const subscribedRepos = subscriptions.map((subscription) => subscription.repoFullName).sort()

  if (subscribedRepos.length === 0) {
    return aggregateUsageRows([], range, subscribedRepos)
  }

  const repoSql = sql.join(
    subscribedRepos.map((repo) => sql`${repo}`),
    sql`, `,
  )

  let rows: Array<Record<string, unknown>>
  try {
    rows = (await graphDb.execute(sql`
      SELECT
        id,
        repo,
        model_id,
        COALESCE(triggered_at, created_at) AS occurred_at,
        token_inputs,
        token_outputs,
        estimated_cost_usd
      FROM executions
      WHERE repo IN (${repoSql})
        AND COALESCE(triggered_at, created_at) >= ${range.from}
        AND COALESCE(triggered_at, created_at) <= ${range.to}
        AND (
          token_inputs IS NOT NULL
          OR token_outputs IS NOT NULL
          OR estimated_cost_usd IS NOT NULL
        )
      ORDER BY occurred_at ASC
    `)) as unknown as Array<Record<string, unknown>>
  } catch (err) {
    // Graph DB is a separate process; if it is down the page degrades to empty, never 500s.
    console.error(`[usage] graph read failed for ${userId}:`, err)
    return aggregateUsageRows([], range, subscribedRepos)
  }

  return aggregateUsageRows(rows.map(mapUsageSourceRow), range, subscribedRepos)
}

export function aggregateUsageRows(rows: UsageSourceRow[], range: UsageRange, subscribedRepos: string[]): UsageResult {
  const scopedRows = rows.filter((row) => subscribedRepos.includes(row.repo) && inRange(row.occurredAt, range))
  const byDay = new Map<string, UsageDay>()
  const byRepoModel = new Map<string, UsageRepoModel>()
  const summary: UsageSummary = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalEstimatedCostUsd: 0,
    executionsWithUsage: 0,
  }

  for (const day of eachUtcDay(range.from, range.to)) {
    byDay.set(day, { day, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
  }

  for (const row of scopedRows) {
    const dayKey = toUtcDay(row.occurredAt)
    const inputTokens = row.tokenInputs ?? 0
    const outputTokens = row.tokenOutputs ?? 0
    const totalTokens = inputTokens + outputTokens
    const estimatedCostUsd = row.estimatedCostUsd ?? 0
    const model = row.modelId ?? 'unknown'

    const day = byDay.get(dayKey) ?? {
      day: dayKey,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    }
    day.inputTokens += inputTokens
    day.outputTokens += outputTokens
    day.totalTokens += totalTokens
    day.estimatedCostUsd += estimatedCostUsd
    byDay.set(dayKey, day)

    const repoModelKey = `${row.repo}\u0000${model}`
    const repoModel = byRepoModel.get(repoModelKey) ?? {
      repo: row.repo,
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      executions: 0,
    }
    repoModel.inputTokens += inputTokens
    repoModel.outputTokens += outputTokens
    repoModel.totalTokens += totalTokens
    repoModel.estimatedCostUsd += estimatedCostUsd
    repoModel.executions += 1
    byRepoModel.set(repoModelKey, repoModel)

    summary.totalInputTokens += inputTokens
    summary.totalOutputTokens += outputTokens
    summary.totalTokens += totalTokens
    summary.totalEstimatedCostUsd += estimatedCostUsd
    summary.executionsWithUsage += 1
  }

  return {
    range,
    subscribedRepos,
    summary,
    byDay: Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day)),
    byRepoModel: Array.from(byRepoModel.values()).sort((a, b) => {
      const repo = a.repo.localeCompare(b.repo)
      return repo === 0 ? a.model.localeCompare(b.model) : repo
    }),
  }
}

function mapUsageSourceRow(row: Record<string, unknown>): UsageSourceRow {
  return {
    id: String(row.id),
    repo: String(row.repo),
    modelId: row.model_id ? String(row.model_id) : null,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at)),
    tokenInputs: row.token_inputs === null || row.token_inputs === undefined ? null : Number(row.token_inputs),
    tokenOutputs: row.token_outputs === null || row.token_outputs === undefined ? null : Number(row.token_outputs),
    estimatedCostUsd:
      row.estimated_cost_usd === null || row.estimated_cost_usd === undefined ? null : Number(row.estimated_cost_usd),
  }
}

function inRange(date: Date, range: UsageRange): boolean {
  return date >= range.from && date <= range.to
}

function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function eachUtcDay(from: Date, to: Date): string[] {
  const days: string[] = []
  const cursor = new Date(from)
  cursor.setUTCHours(0, 0, 0, 0)

  while (cursor <= to) {
    days.push(toUtcDay(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}
