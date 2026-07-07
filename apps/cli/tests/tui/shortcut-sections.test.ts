import { describe, expect, test } from 'bun:test'
import { buildShortcutSections } from '../../src/tui/help/shortcut-sections'
import { buildKeybindings } from '../../src/tui/keybindings/registry'

const allKeys = (sections: ReturnType<typeof buildShortcutSections>): string[] =>
  sections.flatMap((s) => s.rows.map((r) => r.key))

describe('buildShortcutSections', () => {
  test('shows default combos', () => {
    const keys = allKeys(buildShortcutSections(buildKeybindings()))
    expect(keys).toContain('ctrl+f') // history-search
    expect(keys).toContain('ctrl+l') // clear-transcript
    expect(keys).toContain('shift+tab') // cycle-permission-mode
  })

  test('reflects a user rebind instead of the default', () => {
    const keys = allKeys(buildShortcutSections(buildKeybindings({ 'history-search': 'ctrl+t' })))
    expect(keys).toContain('ctrl+t')
    expect(keys).not.toContain('ctrl+f')
  })
})
