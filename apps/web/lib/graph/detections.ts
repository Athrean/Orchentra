import { sql } from 'drizzle-orm'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { graphDb } from './client'
import { safeGraphRead, type ReadStatus } from './result'
import { getUsageRange, USAGE_RANGE_OPTIONS, type UsageRange } from './usage'

export { getUsageRange as getDetectionRange, USAGE_RANGE_OPTIONS as DETECTION_RANGE_OPTIONS }

// Detection is grounded ONLY in `executions` rows that actually exist —
// kind = 'ci_failure'. There is no pod / container / runtime failure ingest
// (CLAUDE.md §9 out-of-scope), so those signals are surfaced as honest
// connect-to-enable cards in the UI, never as fabricated tiles.
export interface Detection {
  id: string
  repo: string
  branch: string
  workflowName: string
  failedStep: string | null
  status: string
  confidence: number | null
  rootCause: string | null
  suggestedFix: string | null
  githubPrUrl: string | null
  githubIssueUrl: string | null
  mttrSeconds: number | null
  occurredAt: Date
  resolved: boolean
}

export interface DetectionDay {
  day: string
  count: number
}

export interface DetectionSummary {
  total: number
  open: number
  resolved: number
  mttrP50Seconds: number | null
  byDay: DetectionDay[]
}

export interface DetectionResult {
  range: UsageRange
  subscribedRepos: string[]
  status: ReadStatus
  detections: Detection[]
  summary: DetectionSummary
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function mapDetectionRow(row: Record<string, unknown>): Detection {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v))
  return {
    id: String(row.id),
    repo: String(row.repo),
    branch: str(row.branch) ?? '',
    workflowName: str(row.workflow_name) ?? '(unnamed)',
    failedStep: str(row.failed_step),
    status: str(row.status) ?? 'investigating',
    confidence: num(row.confidence),
    rootCause: str(row.root_cause),
    suggestedFix: str(row.suggested_fix),
    githubPrUrl: str(row.github_pr_url),
    githubIssueUrl: str(row.github_issue_url),
    mttrSeconds: num(row.mttr_seconds),
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at)),
    resolved: row.resolved_at !== null && row.resolved_at !== undefined,
  }
}

export function summarizeDetections(detections: Detection[], range: UsageRange): DetectionSummary {
  const total = detections.length
  const resolved = detections.filter((d) => d.resolved).length
  const mttrP50Seconds = median(
    detections.map((d) => d.mttrSeconds).filter((s): s is number => s !== null && Number.isFinite(s)),
  )

  const buckets = new Map<string, number>()
  for (const day of eachUtcDay(range.from, range.to)) buckets.set(day, 0)
  for (const detection of detections) {
    const key = toUtcDay(detection.occurredAt)
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return {
    total,
    open: total - resolved,
    resolved,
    mttrP50Seconds,
    byDay: Array.from(buckets.entries()).map(([day, count]) => ({ day, count })),
  }
}

export async function getDetectionsForUser(userId: string, range: UsageRange): Promise<DetectionResult> {
  const subscriptions = await getUserSubscriptions(userId)
  const subscribedRepos = subscriptions.map((subscription) => subscription.repoFullName).sort()

  if (subscribedRepos.length === 0) {
    return { range, subscribedRepos, status: 'empty', detections: [], summary: summarizeDetections([], range) }
  }

  const repoSql = sql.join(
    subscribedRepos.map((repo) => sql`${repo}`),
    sql`, `,
  )

  const result = await safeGraphRead<Array<Record<string, unknown>>>('detections', [], async () => {
    return (await graphDb.execute(sql`
      SELECT
        id, repo, branch, workflow_name, failed_step, status, confidence,
        root_cause, suggested_fix, github_pr_url, github_issue_url, mttr_seconds, resolved_at,
        COALESCE(triggered_at, created_at) AS occurred_at
      FROM executions
      WHERE repo IN (${repoSql})
        AND kind = 'ci_failure'
        AND COALESCE(triggered_at, created_at) >= ${range.from.toISOString()}
        AND COALESCE(triggered_at, created_at) <= ${range.to.toISOString()}
      ORDER BY occurred_at DESC
      LIMIT 100
    `)) as unknown as Array<Record<string, unknown>>
  })

  const detections = result.data.map(mapDetectionRow)
  return { range, subscribedRepos, status: result.status, detections, summary: summarizeDetections(detections, range) }
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
