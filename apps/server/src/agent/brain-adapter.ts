import { setBrainAdapter, type BrainAdapter } from '@orchentra/operations'
import { createDrizzleBrainAdapter } from '@orchentra/brain'
import { db } from '../db/client'

let installed = false

/**
 * Bind the Drizzle-backed brain adapter into `@orchentra/operations` so the
 * brain ops (`record_episode`, `list_episodes`, `get_runbook`,
 * `list_runbooks`, `export_skills_md`) have a concrete persistence layer.
 *
 * Idempotent — safe to call from each tool registration site, like
 * `ensureServerOperationsWired`.
 */
export function ensureServerBrainWired(): void {
  if (installed) return
  // The drizzle adapter and the operations BrainAdapter share the same row
  // shape; the cast just satisfies the structural identity across packages.
  setBrainAdapter(createDrizzleBrainAdapter(db) as BrainAdapter)
  installed = true
}
