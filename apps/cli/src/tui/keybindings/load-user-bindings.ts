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
  // JSON.parse silently keeps only the last value for a repeated key, so a
  // second entry for the same action would drop the first with no trace. Scan
  // the raw text to surface that instead of losing a binding quietly.
  for (const key of findDuplicateKeys(text)) {
    warnings.push(`Duplicate keybinding key "${key}" in ${path} — only the last value is applied.`)
  }
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

/**
 * Names of object keys that appear more than once within the same object in a
 * (well-formed) JSON document. Walks the raw text tracking object/array nesting
 * and string escapes; a string immediately followed by `:` is a key at the
 * current depth. Used to catch the binding a repeated key would silently drop.
 */
export function findDuplicateKeys(text: string): string[] {
  const duplicates: string[] = []
  const reported = new Set<string>()
  // One frame per open container: a key-set for objects, null for arrays.
  const stack: Array<Set<string> | null> = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{') {
      stack.push(new Set<string>())
      i++
    } else if (ch === '[') {
      stack.push(null)
      i++
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      i++
    } else if (ch === '"') {
      const start = i
      i++
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === '"') {
          i++
          break
        }
        i++
      }
      // A string is a key only when the next non-space character is a colon.
      let j = i
      while (j < text.length && /\s/.test(text[j])) j++
      const frame = stack[stack.length - 1]
      if (text[j] === ':' && frame) {
        const key = JSON.parse(text.slice(start, i)) as string
        if (frame.has(key)) {
          if (!reported.has(key)) {
            duplicates.push(key)
            reported.add(key)
          }
        } else {
          frame.add(key)
        }
      }
    } else {
      i++
    }
  }
  return duplicates
}
