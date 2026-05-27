import { sql } from 'drizzle-orm'
import { getUserSubscriptions } from '../db/queries/subscriptions'
import { graphDb } from './client'

export interface BrainEpisode {
  id: string
  repo: string
  executionId: string
  kind: string
  summary: string
  outcome: string
  opsCalled: string[]
  createdAt: Date
}

export interface BrainRunbook {
  id: string
  name: string
  description: string
  triggers: string[]
  opsUsed: string[]
  createdAt: Date
}

export interface BrainResult {
  subscribedRepos: string[]
  episodes: BrainEpisode[]
  runbooks: BrainRunbook[]
}

export async function getBrainForUser(userId: string): Promise<BrainResult> {
  const subscriptions = await getUserSubscriptions(userId)
  const subscribedRepos = subscriptions.map((subscription) => subscription.repoFullName).sort()

  if (subscribedRepos.length === 0) {
    return { subscribedRepos, episodes: [], runbooks: [] }
  }

  const repoSql = sql.join(
    subscribedRepos.map((repo) => sql`${repo}`),
    sql`, `,
  )

  try {
    const episodeRows = (await graphDb.execute(sql`
      SELECT
        e.id,
        x.repo,
        e.execution_id,
        e.kind,
        e.summary,
        e.outcome,
        e.ops_called,
        e.created_at
      FROM episodes e
      INNER JOIN executions x ON x.id = e.execution_id
      WHERE x.repo IN (${repoSql})
      ORDER BY e.created_at DESC
      LIMIT 50
    `)) as unknown as Array<Record<string, unknown>>

    const orgRows = (await graphDb.execute(sql`
      SELECT DISTINCT org_id
      FROM executions
      WHERE repo IN (${repoSql})
    `)) as unknown as Array<Record<string, unknown>>

    const orgIds = orgRows.map((row) => String(row.org_id)).filter(Boolean)
    const runbooks = orgIds.length > 0 ? await getRunbooksForOrgs(orgIds) : []

    return {
      subscribedRepos,
      episodes: episodeRows.map(mapEpisode),
      runbooks,
    }
  } catch (err) {
    // Graph DB is a separate process; if it is down the page degrades to empty, never 500s.
    console.error(`[brain] graph read failed for ${userId}:`, err)
    return { subscribedRepos, episodes: [], runbooks: [] }
  }
}

async function getRunbooksForOrgs(orgIds: string[]): Promise<BrainRunbook[]> {
  const orgSql = sql.join(
    orgIds.map((orgId) => sql`${orgId}`),
    sql`, `,
  )

  const rows = (await graphDb.execute(sql`
    SELECT id, name, description, triggers, ops_used, created_at
    FROM runbooks
    WHERE org_id IN (${orgSql})
    ORDER BY created_at DESC
    LIMIT 50
  `)) as unknown as Array<Record<string, unknown>>

  return rows.map(mapRunbook)
}

function mapEpisode(row: Record<string, unknown>): BrainEpisode {
  return {
    id: String(row.id),
    repo: String(row.repo),
    executionId: String(row.execution_id),
    kind: String(row.kind),
    summary: String(row.summary),
    outcome: String(row.outcome),
    opsCalled: stringArray(row.ops_called),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }
}

function mapRunbook(row: Record<string, unknown>): BrainRunbook {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    triggers: stringArray(row.triggers),
    opsUsed: stringArray(row.ops_used),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item))
}
