import { chordMatchesKey, comboToString, parseCombo, type KeyChord, type MatchKey } from './parse'
import { DEFAULT_BINDINGS, KEY_ACTION_IDS, RESERVED_COMBOS, isKeyActionId, type KeyActionId } from './bindings'

export interface Keybindings {
  /** Resolve an Ink key event to the action it triggers, or null. */
  resolve(input: string, key: MatchKey): KeyActionId | null
  /** Canonical combo bound to an action (for `?` help + display). */
  combo(action: KeyActionId): string
  /** Non-fatal problems found while merging user overrides. */
  readonly warnings: readonly string[]
}

const RESERVED = new Set(RESERVED_COMBOS)

/**
 * Build the active keybindings from defaults plus optional user overrides.
 * Overrides are validated (known action, parseable combo, not reserved, no
 * duplicate) and every rejection is reported as a warning rather than thrown —
 * a bad keybindings.json degrades to defaults, it never breaks the REPL.
 */
export function buildKeybindings(userOverrides?: Readonly<Record<string, string>>): Keybindings {
  const warnings: string[] = []
  const combos: Record<KeyActionId, string> = { ...DEFAULT_BINDINGS }

  for (const [action, rawCombo] of Object.entries(userOverrides ?? {})) {
    if (!isKeyActionId(action)) {
      warnings.push(`Unknown keybinding action "${action}" ignored.`)
      continue
    }
    const chord = parseCombo(rawCombo)
    if (chord === null) {
      warnings.push(`Unparseable keybinding "${rawCombo}" for "${action}" ignored.`)
      continue
    }
    const canonical = comboToString(chord)
    if (RESERVED.has(canonical)) {
      warnings.push(`Cannot rebind "${action}" to reserved combo "${canonical}"; kept default.`)
      continue
    }
    combos[action] = canonical
  }

  // Resolve in a stable action order; on a duplicate combo the earlier action
  // wins and the later one is dropped with a warning so resolution stays
  // deterministic (no silent shadowing).
  const parsed: Array<{ action: KeyActionId; chord: KeyChord }> = []
  const claimed = new Map<string, KeyActionId>()
  for (const action of KEY_ACTION_IDS) {
    const chord = parseCombo(combos[action])
    if (chord === null) continue // defaults are always valid; guard anyway
    const canonical = comboToString(chord)
    const owner = claimed.get(canonical)
    if (owner !== undefined) {
      warnings.push(
        `Keybinding conflict: "${canonical}" bound to both "${owner}" and "${action}"; "${action}" ignored.`,
      )
      continue
    }
    claimed.set(canonical, action)
    parsed.push({ action, chord })
  }

  return {
    warnings,
    combo: (action) => combos[action],
    resolve(input, key) {
      for (const { action, chord } of parsed) {
        if (chordMatchesKey(chord, input, key)) return action
      }
      return null
    },
  }
}
