import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ParsedSkill } from './types'

/**
 * Per-root skill index cache. Walking `.orchentra/skills` for every REPL
 * boot costs ~20-50ms on macOS once a few skills land; this stores the
 * resolved entries on disk and re-walks only when the underlying directory
 * changed.
 *
 * Layout mirrors `apps/cli/src/session-config.ts`: 0600 file, atomic write
 * via tmp + rename, JSON object with a stable `version` envelope.
 *
 * Path: `~/.config/orchentra/skills.idx` (override via `ORCHENTRA_CONFIG_HOME`).
 *
 * Invalidation: an entry is reused only when both the directory's `mtimeMs`
 * and the hash of contained file mtimes match. Touching a single SKILL.md
 * (or adding/removing a skill dir) flips one of the two.
 */

const FILE_MODE = 0o600
const DIR_MODE = 0o700
const VERSION = 1

interface CacheEntry {
  rootPath: string
  mtimeMs: number
  dirHash: string
  skills: ParsedSkill[]
}

interface CacheFile {
  version: typeof VERSION
  entries: Record<string, CacheEntry>
}

export function skillsCachePath(): string {
  const override = process.env.ORCHENTRA_CONFIG_HOME
  if (override && override.length > 0) return join(override, 'skills.idx')
  return join(homedir(), '.config', 'orchentra', 'skills.idx')
}

export function rootKey(rootPath: string): string {
  return createHash('sha256').update(rootPath).digest('hex')
}

function loadFile(): CacheFile {
  const path = skillsCachePath()
  if (!existsSync(path)) return { version: VERSION, entries: {} }
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return { version: VERSION, entries: {} }
    const parsed = JSON.parse(text) as Partial<CacheFile>
    if (parsed.version !== VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return { version: VERSION, entries: {} }
    }
    return { version: VERSION, entries: parsed.entries }
  } catch {
    return { version: VERSION, entries: {} }
  }
}

function persistFile(file: CacheFile): void {
  const path = skillsCachePath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  // Tmp filename includes pid so concurrent writers can't collide while
  // staging. rename() is atomic on POSIX; the last writer wins, but neither
  // produces a partial/corrupt index.
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  writeFileSync(tmp, JSON.stringify(file) + '\n', { mode: FILE_MODE })
  try {
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw err
  }
  try {
    chmodSync(path, FILE_MODE)
  } catch {
    /* ignore — permissions are best-effort on non-POSIX */
  }
}

/**
 * Computes a stable digest of every immediate `SKILL.md` mtime under
 * `rootPath`. Entry order is sorted so two equal directory states produce
 * an equal hash. Returns null when the directory does not exist.
 */
export async function computeDirHash(rootPath: string): Promise<{ mtimeMs: number; dirHash: string } | null> {
  let rootStat
  try {
    rootStat = await stat(rootPath)
  } catch {
    return null
  }
  if (!rootStat.isDirectory()) return null

  const entries = await readdir(rootPath, { withFileTypes: true })
  const items: Array<{ name: string; mtimeMs: number }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillFile = join(rootPath, entry.name, 'SKILL.md')
    try {
      const s = await stat(skillFile)
      if (s.isFile()) items.push({ name: entry.name, mtimeMs: s.mtimeMs })
    } catch {
      /* skip missing or unreadable SKILL.md */
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name))

  const h = createHash('sha256')
  for (const item of items) {
    h.update(item.name)
    h.update('\0')
    h.update(String(item.mtimeMs))
    h.update('\0')
  }
  return { mtimeMs: rootStat.mtimeMs, dirHash: h.digest('hex') }
}

/**
 * Returns cached skills for `rootPath` when both the directory mtime and
 * file-mtime hash match. Returns null on miss (caller must walk fresh).
 */
export function readCached(rootPath: string, current: { mtimeMs: number; dirHash: string }): ParsedSkill[] | null {
  const file = loadFile()
  const key = rootKey(rootPath)
  const entry = file.entries[key]
  if (!entry) return null
  if (entry.mtimeMs !== current.mtimeMs) return null
  if (entry.dirHash !== current.dirHash) return null
  return entry.skills
}

/**
 * Atomically updates the cached entry for `rootPath`. Existing entries for
 * other roots are preserved.
 */
export function writeCached(
  rootPath: string,
  current: { mtimeMs: number; dirHash: string },
  skills: ParsedSkill[],
): void {
  const file = loadFile()
  file.entries[rootKey(rootPath)] = {
    rootPath,
    mtimeMs: current.mtimeMs,
    dirHash: current.dirHash,
    skills,
  }
  persistFile(file)
}
