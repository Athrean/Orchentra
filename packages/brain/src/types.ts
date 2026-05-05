/**
 * Brain primitives. These types are append-only logs and distilled patterns
 * derived from the execution graph (executions + nodes). They do not own a
 * trigger surface of their own — they hang off existing executions.
 *
 * This file defines only the in-memory shapes. The Drizzle table defs (with
 * column-level metadata, indexes, FKs) live in `@orchentra/db` so the wider
 * codebase keeps a single source of truth for storage.
 */

/** Outcome of a single investigation/fix run, summarised for later distillation. */
export type EpisodeOutcome = 'success' | 'failure' | 'unknown'

/**
 * One row of the append-only "what happened" log. References the originating
 * execution so consumers can join back to the full node graph when needed.
 *
 * `opsCalled` is a flat list of operation ids (e.g. `['get_workflow_logs',
 * 'post_comment']`) — enough to seed the runbook distiller without re-walking
 * the node tree for every read.
 */
export interface Episode {
  id: string
  orgId: string
  executionId: string
  /** Mirrors `executions.kind` so episodes can be filtered without a join. */
  kind: string
  summary: string
  opsCalled: string[]
  outcome: EpisodeOutcome
  createdAt: Date
}

/**
 * A reusable pattern distilled from one or more successful episodes. The body
 * is human-readable Markdown; `triggers` and `opsUsed` are the structured
 * metadata that lets the brain look a runbook up and that the SKILL.md
 * exporter renders into frontmatter.
 *
 * Triggers are free-form strings today (e.g. `'execution.kind:ci_failure'`,
 * `'failed_step:integration_tests'`). When a real distiller lands they will
 * be promoted to a richer structure; the table column is text to leave room.
 */
export interface Runbook {
  id: string
  orgId: string
  name: string
  description: string
  triggers: string[]
  opsUsed: string[]
  body: string
  createdAt: Date
}

/**
 * The export-friendly view of a runbook — the same shape that gets serialised
 * into a SKILL.md document. Stripped of storage-level fields (`id`, `orgId`,
 * `createdAt`) so an external agent loading the file does not need to know
 * anything about our DB.
 */
export interface Skill {
  name: string
  description: string
  triggers: string[]
  opsUsed: string[]
  body: string
}
