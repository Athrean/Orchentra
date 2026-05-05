/**
 * Minimal brain surface the operations package depends on. The concrete
 * Drizzle-backed implementation lives in `@orchentra/brain` and is wired in
 * by the host (server, CLI, tests) via `setBrainAdapter`. Keeping the
 * contract narrow here means the operations package never imports Drizzle,
 * Postgres, or anything DB-shaped.
 */

export interface EpisodeRow {
  id: string
  orgId: string
  executionId: string
  kind: string
  summary: string
  opsCalled: string[]
  outcome: 'success' | 'failure' | 'unknown'
  createdAt: Date
}

export interface RunbookRow {
  id: string
  orgId: string
  name: string
  description: string
  triggers: string[]
  opsUsed: string[]
  body: string
  createdAt: Date
}

export interface ListEpisodesFilter {
  orgId?: string
  kind?: string
  /** Inclusive ISO date string lower bound on createdAt. */
  since?: string
  /** Hard cap on rows returned. Adapter should default to a sane value. */
  limit?: number
}

export interface ListRunbooksFilter {
  orgId?: string
  name?: string
  limit?: number
}

export interface BrainAdapter {
  saveEpisode: (episode: EpisodeRow) => Promise<EpisodeRow>
  listEpisodes: (filter: ListEpisodesFilter) => Promise<EpisodeRow[]>
  getRunbook: (id: string) => Promise<RunbookRow | null>
  listRunbooks: (filter: ListRunbooksFilter) => Promise<RunbookRow[]>
}

let adapter: BrainAdapter | null = null

export function setBrainAdapter(next: BrainAdapter | null): void {
  adapter = next
}

export function getBrainAdapter(): BrainAdapter {
  if (!adapter) {
    throw new Error(
      'BrainAdapter is not configured. Call setBrainAdapter() during host boot before invoking brain operations.',
    )
  }
  return adapter
}
