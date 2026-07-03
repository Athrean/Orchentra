import { describe, expect, test } from 'bun:test'
import { THEME, modeAccent, statusGlyph } from '../src/tui/theme'

describe('THEME tokens', () => {
  test('exposes a single brand-green hex used everywhere', () => {
    expect(THEME.brand).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('dark theme uses the marketing green', () => {
    expect(THEME.brand).toBe('#10A37F')
  })

  test('spinner frames are non-empty single-char strings', () => {
    expect(THEME.spinner.length).toBeGreaterThan(0)
    for (const f of THEME.spinner) expect(f.length).toBe(1)
  })

  test('separator and rule chars are single-cell glyphs', () => {
    expect(THEME.separator.length).toBe(1)
    expect(THEME.rule.length).toBe(1)
  })
})

describe('modeAccent', () => {
  test('maps each PermissionMode to a colour name or hex', () => {
    expect(modeAccent('read-only')).toBeDefined()
    expect(modeAccent('workspace-write')).toBe(THEME.brand)
    expect(modeAccent('allow')).toBe(THEME.warn)
    expect(modeAccent('danger-full-access')).toBe(THEME.danger)
    expect(modeAccent('prompt')).toBeDefined()
  })
})

describe('statusGlyph', () => {
  test('idle/running/cancelling each return a glyph', () => {
    expect(statusGlyph('idle').length).toBeGreaterThan(0)
    expect(statusGlyph('running').length).toBeGreaterThan(0)
    expect(statusGlyph('cancelling').length).toBeGreaterThan(0)
  })
})
