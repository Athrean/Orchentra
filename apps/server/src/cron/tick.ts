import { parseCronSpec } from './cron-spec'

/** Row shape pulled from `cron_specs`. Kept local so this module stays
 * driver-free and easy to test without a DB. */
export interface CronSpecRow {
  id: string
  orgId: string
  skillName: string
  cronExpr: string
  lastTickedAt: Date | null
  enabled: number
}

/**
 * Pure selector: given the current set of cron specs and the wall-clock
 * `now`, returns the rows that should fire on this tick.
 *
 * Rules:
 * - `enabled = 0` rows are skipped
 * - rows with an unparseable expression are skipped (the row is bad data;
 *   surfacing the parse error is the writer's responsibility, not the
 *   tick loop's)
 * - rows are due iff `cron(now)` matches AND `lastTickedAt` is in a
 *   strictly earlier minute (or null) — prevents a fast tick loop from
 *   spawning multiple executions inside the same minute
 *
 * The selector is pure so the scheduler runtime can decide separately how
 * to update `last_ticked_at` and how to spawn the execution.
 */
export function selectDueCronSpecs(rows: readonly CronSpecRow[], now: Date): CronSpecRow[] {
  const out: CronSpecRow[] = []
  for (const row of rows) {
    if (row.enabled === 0) continue
    const spec = parseCronSpec(row.cronExpr)
    if (spec.kind !== 'ok') continue
    if (!spec.value.matches(now)) continue
    if (row.lastTickedAt && sameUtcMinute(row.lastTickedAt, now)) continue
    out.push(row)
  }
  return out
}

function sameUtcMinute(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate() &&
    a.getUTCHours() === b.getUTCHours() &&
    a.getUTCMinutes() === b.getUTCMinutes()
  )
}
