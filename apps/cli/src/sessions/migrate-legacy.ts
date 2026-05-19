import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Bucket name reserved for legacy flat-dir sessions. Distinct from any real
 * SHA-256(workspace) fingerprint because it contains a letter outside
 * `[0-9a-f]` — so it can never collide with `fingerprintWorkspace()` output.
 */
export const LEGACY_FINGERPRINT = 'legacy'

export interface MigrateResult {
  moved: number
}

/**
 * One-shot migration from the original flat layout
 *   `<homedir>/.orchentra/sessions/<id>.jsonl`
 * to the workspace-fingerprinted layout
 *   `<homedir>/.orchentra/sessions/<fingerprint>/<id>.jsonl`.
 *
 * Files that were written before fingerprinting existed are moved into a
 * dedicated `legacy/` bucket. They remain readable via the cross-workspace
 * resume path; they do NOT pollute any real workspace's view.
 *
 * Idempotent: re-running after the move is a no-op. Safe to call on every
 * CLI startup.
 */
export function migrateLegacySessions(homedirPath: string): MigrateResult {
  const sessions = join(homedirPath, '.orchentra', 'sessions')
  if (!existsSync(sessions)) return { moved: 0 }

  let entries: string[]
  try {
    entries = readdirSync(sessions)
  } catch {
    return { moved: 0 }
  }

  const jsonl = entries.filter((name) => {
    if (!name.endsWith('.jsonl')) return false
    try {
      return statSync(join(sessions, name)).isFile()
    } catch {
      return false
    }
  })
  if (jsonl.length === 0) return { moved: 0 }

  const legacyDir = join(sessions, LEGACY_FINGERPRINT)
  if (!existsSync(legacyDir)) {
    mkdirSync(legacyDir, { recursive: true })
  }

  let moved = 0
  for (const name of jsonl) {
    const src = join(sessions, name)
    const dst = join(legacyDir, name)
    // If a same-named file already exists in legacy/ (shouldn't, but defend),
    // skip rather than clobber.
    if (existsSync(dst)) continue
    renameSync(src, dst)
    moved++
  }
  return { moved }
}
