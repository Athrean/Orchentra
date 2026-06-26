import { dirname, join } from 'node:path'
import { ensureDir, writeFileIfMissing, type InitStatus } from '../init'
import type { ScaffoldEntry } from './architect'

export interface ScaffoldReport {
  created: string[]
  skipped: string[]
}

/**
 * Write the architect's proposed scaffold to disk. Idempotent: creates what's
 * missing, skips what exists, never overwrites. A path ending in `/` is a
 * directory; otherwise a file (its parent dirs are created as needed). The
 * created/skipped report mirrors the CLI's idempotent reporting convention.
 */
export function writeScaffold(entries: ScaffoldEntry[], cwd: string): ScaffoldReport {
  const report: ScaffoldReport = { created: [], skipped: [] }
  for (const entry of entries) {
    const status = entry.path.endsWith('/') ? ensureDir(join(cwd, entry.path)) : writeEntryFile(cwd, entry)
    if (status === 'created') report.created.push(entry.path)
    else report.skipped.push(entry.path)
  }
  return report
}

function writeEntryFile(cwd: string, entry: ScaffoldEntry): InitStatus {
  const abs = join(cwd, entry.path)
  ensureDir(dirname(abs))
  return writeFileIfMissing(abs, placeholder(entry.purpose))
}

function placeholder(purpose: string): string {
  return purpose.trim().length > 0 ? `// TODO: ${purpose.trim()}\n` : ''
}
