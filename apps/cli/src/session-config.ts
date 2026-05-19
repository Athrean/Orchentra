import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

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
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

export function sessionConfigPath(): string {
  const override = process.env['ORCHENTRA_CONFIG_HOME']
  if (override && override.length > 0) return join(override, 'session.json')
  return join(homedir(), '.config', 'orchentra', 'session.json')
}

function load(): SessionConfigFile {
  const path = sessionConfigPath()
  if (!existsSync(path)) return { version: 1 }
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return { version: 1 }
    const parsed = JSON.parse(text) as Partial<SessionConfigFile>
    return {
      version: 1,
      activeRepo: typeof parsed.activeRepo === 'string' ? parsed.activeRepo : undefined,
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
