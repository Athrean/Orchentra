import { describe, expect, test } from 'bun:test'
import { buildKeybindings } from '../../src/tui/keybindings/registry'

describe('buildKeybindings — defaults', () => {
  const kb = buildKeybindings()

  test('resolves the built-in global chords', () => {
    expect(kb.resolve('l', { ctrl: true })).toBe('clear-transcript')
    expect(kb.resolve('r', { ctrl: true })).toBe('toggle-reasoning')
    expect(kb.resolve('f', { ctrl: true })).toBe('history-search')
    expect(kb.resolve('k', { ctrl: true })).toBe('command-palette')
    expect(kb.resolve('', { shift: true, tab: true })).toBe('cycle-permission-mode')
  })

  test('returns null for unbound keys', () => {
    expect(kb.resolve('j', { ctrl: true })).toBeNull()
    expect(kb.resolve('a', {})).toBeNull()
  })

  test('has no warnings on defaults', () => {
    expect(kb.warnings).toEqual([])
  })
})

describe('buildKeybindings — user overrides', () => {
  test('rebinds an action and frees its old combo', () => {
    const kb = buildKeybindings({ 'history-search': 'ctrl+t' })
    expect(kb.resolve('t', { ctrl: true })).toBe('history-search')
    expect(kb.resolve('f', { ctrl: true })).toBeNull()
    expect(kb.combo('history-search')).toBe('ctrl+t')
    expect(kb.warnings).toEqual([])
  })

  test('rejects rebinding onto a reserved combo, keeps the default', () => {
    const kb = buildKeybindings({ 'history-search': 'ctrl+c' })
    expect(kb.resolve('f', { ctrl: true })).toBe('history-search')
    expect(kb.warnings.some((w) => w.includes('reserved'))).toBe(true)
  })

  test('warns on an unknown action id', () => {
    const kb = buildKeybindings({ frobnicate: 'ctrl+t' })
    expect(kb.warnings.some((w) => w.includes('Unknown keybinding action'))).toBe(true)
  })

  test('warns on an unparseable combo', () => {
    const kb = buildKeybindings({ 'history-search': 'ctrl+' })
    expect(kb.warnings.some((w) => w.includes('Unparseable'))).toBe(true)
    expect(kb.resolve('f', { ctrl: true })).toBe('history-search') // kept default
  })

  test('detects a conflict and keeps the earlier action deterministically', () => {
    // toggle-reasoning rebound onto clear-transcript's ctrl+l.
    const kb = buildKeybindings({ 'toggle-reasoning': 'ctrl+l' })
    expect(kb.resolve('l', { ctrl: true })).toBe('clear-transcript')
    expect(kb.warnings.some((w) => w.includes('conflict'))).toBe(true)
  })
})

describe('buildKeybindings — terminal fallbacks', () => {
  test('cycle-permission-mode also answers to alt+m for terminals that eat shift+tab', () => {
    const kb = buildKeybindings()
    expect(kb.resolve('', { shift: true, tab: true })).toBe('cycle-permission-mode') // primary still works
    expect(kb.resolve('m', { meta: true })).toBe('cycle-permission-mode') // fallback
    expect(kb.warnings).toEqual([])
  })

  test('the fallback is dropped once the user rebinds the action', () => {
    const kb = buildKeybindings({ 'cycle-permission-mode': 'ctrl+t' })
    expect(kb.resolve('t', { ctrl: true })).toBe('cycle-permission-mode')
    expect(kb.resolve('m', { meta: true })).toBeNull() // no stale fallback
  })

  test('a user binding on the fallback combo wins over the fallback', () => {
    const kb = buildKeybindings({ 'history-search': 'alt+m' })
    expect(kb.resolve('m', { meta: true })).toBe('history-search')
    expect(kb.warnings).toEqual([])
  })
})
