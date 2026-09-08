import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isTerseMode, userPaths, type TerseMode } from '@orchentra/cli-core'
import { fingerprintWorkspace } from './sessions/workspace-fingerprint'
import { LEGACY_FINGERPRINT, migrateFlatSessions } from './sessions/migrate-legacy'
import { DEFAULT_STATUSLINE_CONFIG, normalizeStatuslineConfig, type StatuslineConfig } from './statusline'

/**
 * Persistent CLI session state. Survives between invocations so the user
 * doesn't have to re-pass `--repo` on every command.
 *
 * Stored at `~/.config/orchentra/session.json` (override via
 * standard `XDG_CONFIG_HOME`). Disk layout mirrors the
 * credential-store convention: 0600 file mode, JSON object with a stable
 * `version` envelope, atomic write via tmp + rename.
 */
interface SessionConfigFile {
  version: 1
  activeRepo?: string
  activeTerseMode?: TerseMode
  defaultModel?: string
  statusline?: StatuslineConfig
  /** Fingerprints of workspaces the user has answered the trust gate for. */
  trustedWorkspaces?: string[]
  [extra: string]: unknown
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

export function sessionConfigPath(): string {
  return join(userPaths().config, 'session.json')
}

/** Default local session storage. Existing installations keep their readable history. */
export function getSessionsRootDir(): string {
  const paths = userPaths()
  // Reuse established history without moving or duplicating user transcripts.
  // An explicit XDG root is isolated (containers and tests must not import host state).
  const legacy = join(paths.legacy, 'sessions')
  if (!process.env.XDG_STATE_HOME && existsSync(legacy)) return legacy
  return join(paths.state, 'sessions')
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
  const base = getSessionsRootDir()
  if (!legacyMigrated.has(base)) {
    legacyMigrated.add(base)
    try {
      migrateFlatSessions(base)
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
      statusline: normalizeStatuslineConfig(parsed.statusline),
      trustedWorkspaces: Array.isArray(parsed.trustedWorkspaces)
        ? parsed.trustedWorkspaces.filter((fp): fp is string => typeof fp === 'string')
        : undefined,
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

export function getStatuslineConfig(): StatuslineConfig {
  return load().statusline ?? DEFAULT_STATUSLINE_CONFIG
}

export function setStatuslineConfig(config: StatuslineConfig): void {
  const file = load()
  file.statusline = normalizeStatuslineConfig(config)
  persist(file)
}

/**
 * Whether the user has already answered the trust gate for this workspace.
 * Keyed by the same per-cwd fingerprint the session buckets use, so the
 * decision is remembered across sessions without re-prompting.
 */
export function isWorkspaceTrusted(workspaceRoot: string): boolean {
  const fingerprint = fingerprintWorkspace(workspaceRoot)
  return (load().trustedWorkspaces ?? []).includes(fingerprint)
}

/** Record that the user trusts this workspace. Idempotent. */
export function trustWorkspace(workspaceRoot: string): void {
  const fingerprint = fingerprintWorkspace(workspaceRoot)
  const file = load()
  const trusted = file.trustedWorkspaces ?? []
  if (trusted.includes(fingerprint)) return
  file.trustedWorkspaces = [...trusted, fingerprint]
  persist(file)
}
