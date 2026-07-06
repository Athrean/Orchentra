import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface LoadedUserBindings {
  /** action id → combo string, as written by the user (unvalidated here). */
  readonly overrides: Readonly<Record<string, string>>
  readonly warnings: readonly string[]
}

/**
 * Read `~/.config/orchentra/keybindings.json` (or `$ORCHENTRA_CONFIG_HOME`).
 * Shape: `{ "bindings": { "history-search": "ctrl+t" } }`. Never throws — a
 * missing file yields no overrides, a malformed one yields a warning and no
 * overrides, so the REPL always boots on defaults. Validation of the combos
 * themselves happens in `buildKeybindings`.
 */
export function loadUserBindings(): LoadedUserBindings {
  const path = keybindingsPath()
  if (!existsSync(path)) return { overrides: {}, warnings: [] }

  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return { overrides: {}, warnings: [] }
  }
  if (text.trim().length === 0) return { overrides: {}, warnings: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { overrides: {}, warnings: [`Ignoring malformed keybindings file: ${path}`] }
  }

  const bindings = (parsed as { bindings?: unknown } | null)?.bindings
  if (bindings === undefined) return { overrides: {}, warnings: [] }
  if (typeof bindings !== 'object' || bindings === null || Array.isArray(bindings)) {
    return { overrides: {}, warnings: [`Ignoring keybindings file: "bindings" must be an object (${path})`] }
  }

  const overrides: Record<string, string> = {}
  const warnings: string[] = []
  for (const [action, combo] of Object.entries(bindings as Record<string, unknown>)) {
    if (typeof combo !== 'string') {
      warnings.push(`Ignoring non-string keybinding for "${action}".`)
      continue
    }
    overrides[action] = combo
  }
  return { overrides, warnings }
}

function keybindingsPath(): string {
  const override = process.env['ORCHENTRA_CONFIG_HOME']
  if (override && override.length > 0) return join(override, 'keybindings.json')
  return join(homedir(), '.config', 'orchentra', 'keybindings.json')
}
