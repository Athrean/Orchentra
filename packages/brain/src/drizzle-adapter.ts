import { and, desc, eq, gte } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { episodes, runbooks } from '@orchentra/db'
import type { EpisodeOutcome } from './types'

/**
 * Row shapes the operations package consumes. Mirrored from
 * `@orchentra/operations`'s `EpisodeRow` / `RunbookRow` so the adapter stays
 * structurally compatible without forcing a runtime dep on operations.
 */
export interface DrizzleEpisodeRow {
  id: string
  orgId: string
  executionId: string
  kind: string
  summary: string
  opsCalled: string[]
  outcome: EpisodeOutcome
  createdAt: Date
}

export interface DrizzleRunbookRow {
  id: string
  orgId: string
  name: string
  description: string
  triggers: string[]
  opsUsed: string[]
  body: string
  createdAt: Date
}

export interface DrizzleListEpisodesFilter {
  orgId?: string
  kind?: string
  since?: string
  limit?: number
}

export interface DrizzleListRunbooksFilter {
  orgId?: string
  name?: string
  limit?: number
}

export interface DrizzleBrainAdapter {
  saveEpisode: (row: DrizzleEpisodeRow) => Promise<DrizzleEpisodeRow>
  listEpisodes: (filter: DrizzleListEpisodesFilter) => Promise<DrizzleEpisodeRow[]>
  getRunbook: (id: string) => Promise<DrizzleRunbookRow | null>
  listRunbooks: (filter: DrizzleListRunbooksFilter) => Promise<DrizzleRunbookRow[]>
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return []
}

function coerceOutcome(value: unknown): EpisodeOutcome {
  if (value === 'success' || value === 'failure') return value
  return 'unknown'
}

/**
 * Bind a `BrainAdapter`-shaped object to a Drizzle Postgres handle. The
 * server (or any host with a real `db`) calls this once at boot and feeds
 * the result into `setBrainAdapter()`.
 *
 * The adapter coerces `jsonb` columns to typed string arrays — Drizzle
 * returns `unknown` for arbitrary jsonb so we narrow defensively.
 */
export function createDrizzleBrainAdapter(db: PostgresJsDatabase<Record<string, unknown>>): DrizzleBrainAdapter {
  return {
    saveEpisode: async (row) => {
      const inserted = await db
        .insert(episodes)
        .values({
          id: row.id,
          orgId: row.orgId,
          executionId: row.executionId,
          kind: row.kind,
          summary: row.summary,
          opsCalled: row.opsCalled,
          outcome: row.outcome,
          createdAt: row.createdAt,
        })
        .returning()
      const persisted = inserted[0] ?? row
      return {
        id: persisted.id,
        orgId: persisted.orgId,
        executionId: persisted.executionId,
        kind: persisted.kind,
        summary: persisted.summary,
        opsCalled: asStringArray(persisted.opsCalled),
        outcome: coerceOutcome(persisted.outcome),
        createdAt: persisted.createdAt,
      }
    },

    listEpisodes: async (filter) => {
      const clauses = []
      if (filter.orgId) clauses.push(eq(episodes.orgId, filter.orgId))
      if (filter.kind) clauses.push(eq(episodes.kind, filter.kind))
      if (filter.since) clauses.push(gte(episodes.createdAt, new Date(filter.since)))
      const where = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses)
      const limit = filter.limit ?? 100
      const query = where
        ? db.select().from(episodes).where(where).orderBy(desc(episodes.createdAt)).limit(limit)
        : db.select().from(episodes).orderBy(desc(episodes.createdAt)).limit(limit)
      const rows = await query
      return rows.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        executionId: r.executionId,
        kind: r.kind,
        summary: r.summary,
        opsCalled: asStringArray(r.opsCalled),
        outcome: coerceOutcome(r.outcome),
        createdAt: r.createdAt,
      }))
    },

    getRunbook: async (id) => {
      const rows = await db.select().from(runbooks).where(eq(runbooks.id, id)).limit(1)
      const r = rows[0]
      if (!r) return null
      return {
        id: r.id,
        orgId: r.orgId,
        name: r.name,
        description: r.description,
        triggers: asStringArray(r.triggers),
        opsUsed: asStringArray(r.opsUsed),
        body: r.body,
        createdAt: r.createdAt,
      }
    },

    listRunbooks: async (filter) => {
      const clauses = []
      if (filter.orgId) clauses.push(eq(runbooks.orgId, filter.orgId))
      if (filter.name) clauses.push(eq(runbooks.name, filter.name))
      const where = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses)
      const limit = filter.limit ?? 100
      const query = where
        ? db.select().from(runbooks).where(where).orderBy(desc(runbooks.createdAt)).limit(limit)
        : db.select().from(runbooks).orderBy(desc(runbooks.createdAt)).limit(limit)
      const rows = await query
      return rows.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        name: r.name,
        description: r.description,
        triggers: asStringArray(r.triggers),
        opsUsed: asStringArray(r.opsUsed),
        body: r.body,
        createdAt: r.createdAt,
      }))
    },
  }
}
