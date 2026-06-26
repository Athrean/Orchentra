import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { isTerseMode, type TerseMode } from '@orchentra/cli-core'
import { fingerprintWorkspace } from './sessions/workspace-fingerprint'
import { LEGACY_FINGERPRINT, migrateLegacySessions } from './sessions/migrate-legacy'

/**
 * Persistent CLI session state. Survives between invocations so the user
 * doesn't have to re-pass `--repo` on every command.
 *
 * Stored at `~/.config/orchentra/session.json` (override via
 * `ORCHENTRA_CONFIG_HOME` for tests / containers). Disk layout mirrors the
 * credential-store convention: 0600 file mode, JSON object with a stable
 * `version` envelope, atomic write via tmp + rename.
 */
interface SessionConfigFile {
  version: 1
  activeRepo?: string
  activeTerseMode?: TerseMode
  defaultModel?: string
  [extra: string]: unknown
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

export function sessionConfigPath(): string {
  const override = process.env['ORCHENTRA_CONFIG_HOME']
  if (override && override.length > 0) return join(override, 'session.json')
  return join(homedir(), '.config', 'orchentra', 'session.json')
}

/**
 * Root directory for all session JSONLs across every workspace this user
 * has invoked the CLI in. `ORCHENTRA_HOME` overrides the home directory
 * (used by tests and container setups).
 */
export function getSessionsRootDir(): string {
  const override = process.env['ORCHENTRA_HOME']
  const base = override && override.length > 0 ? override : homedir()
  return join(base, '.orchentra', 'sessions')
}

const legacyMigrated = new Set<string>()

/**
 * Bucket directory that holds session JSONLs written from `workspaceRoot`.
 *
 * Each workspace gets its own bucket keyed by a stable hash of its absolute
 * path, so two REPLs running in different worktrees of the same repo never
 * race on session ids. The first call in a process also drains the original
 * flat-dir layout into a `legacy/` bucket so existing users keep their
 * history (cross-workspace resume can still find it).
 *
 * The directory is not created — callers (`SessionWriter`, slash commands)
 * are responsible for `mkdir({ recursive: true })` when they actually need
 * to write. That keeps read-only lookups from littering disk with empty
 * dirs for every workspace ever queried.
 */
export function getSessionsDirForWorkspace(workspaceRoot: string): string {
  const override = process.env['ORCHENTRA_HOME']
  const base = override && override.length > 0 ? override : homedir()
  if (!legacyMigrated.has(base)) {
    legacyMigrated.add(base)
    try {
      migrateLegacySessions(base)
    } catch {
      // Migration failure should never block session writes; if a user's
      // legacy/ couldn't be created we'll just leave the flat files alone.
    }
  }
  return join(getSessionsRootDir(), fingerprintWorkspace(workspaceRoot))
}

export { LEGACY_FINGERPRINT }

function load(): SessionConfigFile {
  const path = sessionConfigPath()
  if (!existsSync(path)) return { version: 1 }
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return { version: 1 }
    const parsed = JSON.parse(text) as Partial<SessionConfigFile>
    return {
      ...parsed,
      version: 1,
      activeRepo: typeof parsed.activeRepo === 'string' ? parsed.activeRepo : undefined,
      activeTerseMode: isTerseMode(parsed.activeTerseMode) ? parsed.activeTerseMode : undefined,
      defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : undefined,
    }
  } catch {
    return { version: 1 }
  }
}

function persist(file: SessionConfigFile): void {
  const path = sessionConfigPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n', { mode: FILE_MODE })
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
    /* ignore — permissions best-effort on non-POSIX */
  }
}

export function getActiveRepo(): string | null {
  return load().activeRepo ?? null
}

export function setActiveRepo(repo: string): void {
  const file = load()
  file.activeRepo = repo
  persist(file)
}

export function clearActiveRepo(): void {
  const file = load()
  delete file.activeRepo
  persist(file)
}

export function getActiveTerseMode(): TerseMode | null {
  return load().activeTerseMode ?? null
}

export function setActiveTerseMode(mode: TerseMode): void {
  const file = load()
  file.activeTerseMode = mode
  persist(file)
}

export function getDefaultModel(): string | null {
  return load().defaultModel ?? null
}

export function setDefaultModel(model: string): void {
  const file = load()
  file.defaultModel = model
  persist(file)
}
