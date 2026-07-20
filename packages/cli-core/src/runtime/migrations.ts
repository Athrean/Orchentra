/**
 * Versioned-migration pattern for persisted files. A single `version` integer on
 * the persisted schema plus a small ordered set of pure `vN -> vN+1` transforms,
 * run once at load time when an older version is detected. A version newer than
 * this build understands — or a gap with no transform — throws rather than
 * silently mis-reading the data. Pure: never touches disk.
 *
 * Config settings adopt this as a whole-file contract (see ConfigLoader). The
 * session JSONL log carries its own `protocolVersion` with a deliberately
 * different, per-record resilience policy (a single forward-version record is
 * skipped, not fatal, so one stray line can't sink an otherwise-replayable
 * session — see `migrateRecord` in session.ts).
 */

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

/** A pure transform bringing a persisted object from schema version N to N+1. */
export type Migration = (value: Record<string, unknown>) => Record<string, unknown>

export interface MigrationSpec {
  /** The current (latest) schema version this build understands. Must be >= 1. */
  readonly current: number
  /** Transforms keyed by FROM-version: `migrations[n]` upgrades vN -> v(n+1). */
  readonly migrations?: Readonly<Record<number, Migration>>
  /** Property holding the version integer. Default `'version'`. */
  readonly versionKey?: string
  /**
   * Version to assume when the field is absent. Defaults to 1 — a file written
   * before versioning existed is, by definition, the original schema, so it must
   * still be migrated forward rather than assumed current.
   */
  readonly defaultVersion?: number
}

/**
 * Bring a persisted object up to the current schema version by running each
 * ordered `vN -> vN+1` transform once, then stamp the current version. A version
 * newer than `current`, a non-integer version, or a gap with no transform throws
 * `MigrationError` — fail loud rather than silently corrupt.
 */
export function runMigrations<T = Record<string, unknown>>(value: Record<string, unknown>, spec: MigrationSpec): T {
  const key = spec.versionKey ?? 'version'
  const current = spec.current
  const migrations = spec.migrations ?? {}
  const raw = value[key]
  let version = raw === undefined ? (spec.defaultVersion ?? 1) : raw

  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new MigrationError(`invalid ${key} ${JSON.stringify(raw)}: expected a positive integer`)
  }
  if (version > current) {
    throw new MigrationError(
      `${key} ${version} is newer than this build supports (max ${current}); upgrade Orchentra to read it`,
    )
  }

  let migrated = value
  while (version < current) {
    const step = migrations[version]
    if (!step) {
      throw new MigrationError(`no migration from ${key} ${version} to ${version + 1}`)
    }
    migrated = step(migrated)
    version++
  }
  return { ...migrated, [key]: current } as T
}
