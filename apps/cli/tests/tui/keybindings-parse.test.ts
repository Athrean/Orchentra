import { describe, expect, test } from 'bun:test'
import { chordMatchesKey, comboToString, normalizeCombo, parseCombo } from '../../src/tui/keybindings/parse'

describe('parseCombo', () => {
  test('parses a ctrl+letter combo', () => {
    expect(parseCombo('ctrl+f')).toEqual({ ctrl: true, shift: false, alt: false, key: 'f' })
  })

  test('parses shift+tab', () => {
    expect(parseCombo('shift+tab')).toEqual({ ctrl: false, shift: true, alt: false, key: 'tab' })
  })

  test('accepts modifier aliases (control, opt/option/meta)', () => {
    expect(parseCombo('control+l')?.ctrl).toBe(true)
    expect(parseCombo('opt+x')?.alt).toBe(true)
    expect(parseCombo('option+x')?.alt).toBe(true)
    expect(parseCombo('meta+x')?.alt).toBe(true)
  })

  test('normalizes named-key aliases', () => {
    expect(parseCombo('esc')?.key).toBe('escape')
    expect(parseCombo('return')?.key).toBe('enter')
    expect(parseCombo('↑')?.key).toBe('up')
  })

  test('rejects empty, modifier-only, and multi-key combos', () => {
    expect(parseCombo('')).toBeNull()
    expect(parseCombo('ctrl+')).toBeNull()
    expect(parseCombo('a+b')).toBeNull()
  })
})

describe('comboToString / normalizeCombo', () => {
  test('sorts modifiers into a canonical order', () => {
    expect(comboToString({ ctrl: true, shift: true, alt: true, key: 'k' })).toBe('ctrl+alt+shift+k')
  })

  test('normalizeCombo canonicalizes equivalent spellings', () => {
    expect(normalizeCombo('control+f')).toBe('ctrl+f')
    expect(normalizeCombo('SHIFT+Tab')).toBe('shift+tab')
    expect(normalizeCombo('ctrl+alt')).toBeNull() // modifiers only, no key
  })
})

describe('chordMatchesKey', () => {
  const CTRL_F = parseCombo('ctrl+f')!

  test('matches the exact modifier+key event', () => {
    expect(chordMatchesKey(CTRL_F, 'f', { ctrl: true })).toBe(true)
    expect(chordMatchesKey(CTRL_F, 'F', { ctrl: true })).toBe(true) // case-insensitive
  })

  test('rejects when modifiers differ', () => {
    expect(chordMatchesKey(CTRL_F, 'f', {})).toBe(false)
    expect(chordMatchesKey(CTRL_F, 'f', { ctrl: true, meta: true })).toBe(false)
  })

  test('matches named keys via their Ink flag', () => {
    const SHIFT_TAB = parseCombo('shift+tab')!
    expect(chordMatchesKey(SHIFT_TAB, '', { shift: true, tab: true })).toBe(true)
    expect(chordMatchesKey(SHIFT_TAB, '', { tab: true })).toBe(false) // missing shift
  })
})
