import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persists project-scoped Orchentra settings to `.orchentra/settings.json`.
 *
 * Writes atomically via `<file>.tmp-<pid>-<rand>` + rename, preserving any
 * unrelated keys in an existing file. Called from the CLI bootstrap path
 * after a successful install callback; intentionally surgical so users can
 * also hand-edit the file without us stomping their additions.
 */

export interface WriteProjectSettingsInput {
  readonly cwd: string
  readonly orgId: string
  readonly serverUrl?: string
}

function readExisting(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // unparseable file — overwrite rather than stomp silently
  }
  return {}
}

export function writeProjectSettings(input: WriteProjectSettingsInput): string {
  const dir = join(input.cwd, '.orchentra')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const target = join(dir, 'settings.json')
  const existing = readExisting(target)
  const next: Record<string, unknown> = { ...existing, orgId: input.orgId }
  if (input.serverUrl !== undefined) next.serverUrl = input.serverUrl
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8')
  renameSync(tmp, target)
  return target
}
