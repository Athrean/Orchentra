/**
 * Keystroke parsing + matching for the declarative keybinding registry.
 *
 * A `KeyChord` is a single normalized combo (e.g. `ctrl+f`, `shift+tab`).
 * We deliberately model only what the TUI's global chord layer needs —
 * ctrl/shift/alt + one key — rather than the reference's multi-step chords,
 * because Orchentra's one two-key chord (ctrl+x ctrl+e) is handled by a
 * dedicated state machine, not the registry.
 */
export interface KeyChord {
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  /** Lowercased key: a single char (`f`) or a named key (`tab`, `up`). */
  readonly key: string
}

/** Subset of Ink's `Key` the matcher reads. Kept structural so tests and the
 * key-handler can pass plain objects without importing Ink. */
export interface MatchKey {
  readonly ctrl?: boolean
  readonly shift?: boolean
  readonly meta?: boolean
  readonly tab?: boolean
  readonly return?: boolean
  readonly escape?: boolean
  readonly upArrow?: boolean
  readonly downArrow?: boolean
  readonly leftArrow?: boolean
  readonly rightArrow?: boolean
  readonly backspace?: boolean
  readonly delete?: boolean
}

// Named keys → the Ink `Key` flag that signals them. Character keys (letters,
// digits, punctuation) are matched against the `input` string instead.
const NAMED_KEY_FLAG: Readonly<Record<string, keyof MatchKey>> = {
  tab: 'tab',
  return: 'return',
  enter: 'return',
  escape: 'escape',
  esc: 'escape',
  up: 'upArrow',
  down: 'downArrow',
  left: 'leftArrow',
  right: 'rightArrow',
  backspace: 'backspace',
  delete: 'delete',
}

const MOD_ALIASES: Readonly<Record<string, 'ctrl' | 'shift' | 'alt'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  opt: 'alt',
  option: 'alt',
  meta: 'alt',
}

/**
 * Parse a combo string like `ctrl+f` or `shift+tab` into a normalized chord.
 * Returns null when the combo has no non-modifier key or names an unknown
 * modifier, so callers can surface a config warning instead of binding junk.
 */
export function parseCombo(input: string): KeyChord | null {
  const parts = input
    .trim()
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null

  let ctrl = false
  let shift = false
  let alt = false
  let key = ''
  for (const part of parts) {
    const mod = MOD_ALIASES[part]
    if (mod === 'ctrl') ctrl = true
    else if (mod === 'shift') shift = true
    else if (mod === 'alt') alt = true
    else {
      if (key !== '') return null // two non-modifier keys is not a valid single chord
      key = normalizeKeyName(part)
    }
  }
  if (key === '') return null
  return { ctrl, shift, alt, key }
}

function normalizeKeyName(part: string): string {
  switch (part) {
    case 'esc':
      return 'escape'
    case 'return':
      return 'enter'
    case '↑':
      return 'up'
    case '↓':
      return 'down'
    case '←':
      return 'left'
    case '→':
      return 'right'
    default:
      return part
  }
}

/** Canonical string (modifiers sorted) for conflict comparison + display. */
export function comboToString(chord: KeyChord): string {
  const mods: string[] = []
  if (chord.ctrl) mods.push('ctrl')
  if (chord.alt) mods.push('alt')
  if (chord.shift) mods.push('shift')
  return [...mods, chord.key].join('+')
}

/** Normalize a raw combo string to its canonical form, or null if unparseable. */
export function normalizeCombo(input: string): string | null {
  const chord = parseCombo(input)
  return chord === null ? null : comboToString(chord)
}

/** Does an Ink key event match this chord? */
export function chordMatchesKey(chord: KeyChord, input: string, key: MatchKey): boolean {
  if (chord.ctrl !== !!key.ctrl) return false
  if (chord.alt !== !!key.meta) return false

  const flag = NAMED_KEY_FLAG[chord.key]
  if (flag) {
    if (chord.shift !== !!key.shift) return false
    return !!key[flag]
  }
  // Character key: ctrl+<letter> etc. Compare case-insensitively; shift is not
  // reliably reported for letters across terminals, so only enforce it when the
  // binding explicitly asks for it.
  if (chord.shift && !key.shift) return false
  return input.length > 0 && input.toLowerCase() === chord.key
}
