import type { Keybindings } from '../keybindings/registry'

export interface ShortcutRow {
  readonly key: string
  readonly value: string
}
export interface ShortcutSection {
  readonly title: string
  readonly rows: readonly ShortcutRow[]
}

/**
 * Build the `?` help sections. Rebindable global chords are pulled live from
 * the keybinding registry so the help always reflects the user's actual
 * keybindings.json, not the defaults. Fixed keys (submit, arrows, esc,
 * ctrl+c/d, the trigger chars) are literal.
 */
export function buildShortcutSections(kb: Keybindings): readonly ShortcutSection[] {
  return [
    {
      title: 'Editing',
      rows: [
        { key: 'enter', value: 'submit' },
        { key: 'shift+enter / alt+enter', value: 'newline (alt is a fallback for terminals that swallow shift+enter)' },
        { key: kb.combo('delete-to-line-start'), value: 'delete to start of line' },
        { key: kb.combo('delete-word-back'), value: 'delete previous word' },
        { key: 'alt+left / right', value: 'jump cursor to previous / next word' },
        { key: 'up / down', value: 'history (or move cursor in multi-line)' },
        { key: kb.combo('history-search'), value: 'search history (incremental reverse-search)' },
      ],
    },
    {
      title: 'Session',
      rows: [
        { key: kb.combo('clear-transcript'), value: 'clear visible transcript' },
        { key: kb.combo('toggle-reasoning'), value: 'expand / collapse last reasoning block' },
        { key: kb.combo('toggle-collapsible'), value: 'expand / collapse last tool result' },
        { key: 'ctrl+e', value: 'explain pending command (in confirmation overlay)' },
        { key: kb.combo('cycle-permission-mode'), value: 'cycle permission mode' },
        { key: 'esc', value: 'cancel running turn / clear buffer' },
        { key: 'ctrl+c', value: 'cancel turn / quit' },
        { key: 'ctrl+d', value: 'forward delete / quit on empty line' },
      ],
    },
    {
      title: 'Discovery',
      rows: [
        { key: '/', value: 'slash command picker' },
        { key: kb.combo('command-palette'), value: 'command palette' },
        { key: '@', value: 'file path picker' },
        { key: '!', value: 'shell shortcut' },
        { key: '?', value: 'this help (when buffer is empty)' },
      ],
    },
  ]
}
