/**
 * The set of rebindable global actions and their default combos, plus the
 * combos users may never claim. Contextual keys (arrows while a suggestion
 * popup or card is open, buffer editing, submit) are intentionally NOT in the
 * registry — they depend on transient UI state a flat table can't express and
 * stay in the imperative handler.
 */
export type KeyActionId =
  | 'clear-transcript'
  | 'toggle-reasoning'
  | 'toggle-collapsible'
  | 'history-search'
  | 'command-palette'
  | 'delete-to-line-start'
  | 'delete-word-back'
  | 'cycle-permission-mode'

export const DEFAULT_BINDINGS: Readonly<Record<KeyActionId, string>> = {
  'clear-transcript': 'ctrl+l',
  'toggle-reasoning': 'ctrl+r',
  'toggle-collapsible': 'ctrl+o',
  'history-search': 'ctrl+f',
  'command-palette': 'ctrl+k',
  'delete-to-line-start': 'ctrl+u',
  'delete-word-back': 'ctrl+w',
  'cycle-permission-mode': 'shift+tab',
}

/**
 * Best-effort alternate combos for keys a terminal may swallow. Some terminals
 * (notably older Windows Terminal) never deliver shift+tab, so the action also
 * answers to a fallback chord. Applied by the registry only while the action
 * still uses its default combo and the fallback is otherwise free, so it never
 * shadows a user rebind or another binding. Kept deliberately tiny — one entry
 * per genuinely-problematic combo, not a per-terminal capability matrix.
 */
export const FALLBACK_COMBOS: Readonly<Partial<Record<KeyActionId, string>>> = {
  'cycle-permission-mode': 'alt+m',
}

export const KEY_ACTION_IDS = Object.keys(DEFAULT_BINDINGS) as KeyActionId[]

export function isKeyActionId(value: string): value is KeyActionId {
  return value in DEFAULT_BINDINGS
}

/**
 * Combos that are hardcoded (interrupt/exit/submit) or eaten by the terminal.
 * A user override targeting one of these is rejected with a warning so a
 * rebind can never shadow ctrl+c or the Enter key. Stored canonical (see
 * `comboToString`).
 */
export const RESERVED_COMBOS: readonly string[] = [
  'ctrl+c', // interrupt / exit (hardcoded)
  'ctrl+d', // exit on empty line (hardcoded)
  'ctrl+m', // identical to Enter in terminals (both send CR)
  'enter', // submit (hardcoded)
  'escape', // cancel / clear buffer (hardcoded)
  'ctrl+z', // SIGTSTP (terminal)
  'ctrl+\\', // SIGQUIT (terminal)
]
