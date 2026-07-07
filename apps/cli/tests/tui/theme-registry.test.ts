import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { THEMES, loadActiveTheme, saveActiveTheme, themeNames, isThemeName } from '../../src/tui/theme-registry'

const BUILTIN_NAMES = ['dark', 'light', 'dark-ansi', 'solarized-dark', 'solarized-light', 'high-contrast'] as const

describe('theme registry', () => {
  let tempHome: string
  let prevHome: string | undefined
  beforeEach(() => {
    prevHome = process.env['ORCHENTRA_CONFIG_HOME']
    tempHome = mkdtempSync(join(tmpdir(), 'orchentra-theme-test-'))
    process.env['ORCHENTRA_CONFIG_HOME'] = tempHome
  })
  afterEach(() => {
    if (prevHome === undefined) delete process.env['ORCHENTRA_CONFIG_HOME']
    else process.env['ORCHENTRA_CONFIG_HOME'] = prevHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  test('exports three built-in themes by name', () => {
    for (const name of BUILTIN_NAMES) {
      expect(THEMES[name]).toBeDefined()
    }
  })

  test('every theme exposes the same shape as THEME', () => {
    const expectedKeys = [
      'brand',
      'brandDim',
      'fg',
      'muted',
      'accent',
      'warn',
      'danger',
      'heading',
      'headingAlt',
      'emphasis',
      'strong',
      'link',
      'quote',
      'codeBorder',
      'inlineCode',
      'diffAdd',
      'diffDel',
      'diffHunk',
      'diffFile',
      'prompt',
      'bullet',
      'arrowRight',
      'arrowLeft',
      'check',
      'cross',
      'dot',
      'separator',
      'rule',
      'spinner',
    ] as const
    for (const name of BUILTIN_NAMES) {
      const t = THEMES[name]
      for (const k of expectedKeys) expect(t).toHaveProperty(k)
      expect(Array.isArray(t.spinner)).toBe(true)
      expect(t.spinner.length).toBeGreaterThan(0)
    }
  })

  test('themeNames() lists every built-in theme', () => {
    const names = themeNames()
    for (const n of BUILTIN_NAMES) expect(names).toContain(n)
  })

  test('isThemeName accepts known + rejects unknown', () => {
    expect(isThemeName('dark')).toBe(true)
    expect(isThemeName('light')).toBe(true)
    expect(isThemeName('dark-ansi')).toBe(true)
    expect(isThemeName('solarized-dark')).toBe(true)
    expect(isThemeName('solarized-light')).toBe(true)
    expect(isThemeName('high-contrast')).toBe(true)
    expect(isThemeName('garbage')).toBe(false)
  })

  test('solarized-dark uses Schoonover base palette', () => {
    const t = THEMES['solarized-dark']
    expect(t.fg).toBe('#839496')
    expect(t.accent).toBe('#2aa198')
    expect(t.heading).toBe('#268bd2')
  })

  test('solarized-light uses lighter foreground over paper canvas', () => {
    const t = THEMES['solarized-light']
    expect(t.fg).toBe('#657b83')
    expect(t.muted).toBe('#93a1a1')
  })

  test('high-contrast uses pure RGB primaries for WCAG AAA', () => {
    const t = THEMES['high-contrast']
    expect(t.fg).toBe('#ffffff')
    expect(t.danger).toBe('#ff0000')
    expect(t.brand).toBe('#00ff00')
    expect(t.accent).toBe('#00ffff')
  })

  test('saveActiveTheme round-trips for each new built-in', () => {
    saveActiveTheme('solarized-dark')
    expect(loadActiveTheme()).toBe('solarized-dark')
    saveActiveTheme('solarized-light')
    expect(loadActiveTheme()).toBe('solarized-light')
    saveActiveTheme('high-contrast')
    expect(loadActiveTheme()).toBe('high-contrast')
  })

  test('loadActiveTheme returns dark when no config exists', () => {
    const loaded = loadActiveTheme()
    expect(loaded).toBe('dark')
  })

  test('saveActiveTheme then loadActiveTheme round-trips', () => {
    saveActiveTheme('light')
    expect(loadActiveTheme()).toBe('light')
    saveActiveTheme('dark-ansi')
    expect(loadActiveTheme()).toBe('dark-ansi')
  })

  test('saveActiveTheme leaves other keys intact (does not clobber activeRepo)', () => {
    const path = join(tempHome, 'session.json')
    mkdirSync(tempHome, { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, activeRepo: 'foo/bar' }))
    saveActiveTheme('light')
    expect(existsSync(path)).toBe(true)
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(raw['activeRepo']).toBe('foo/bar')
    expect(raw['activeTheme']).toBe('light')
  })

  test('loadActiveTheme defaults to dark on malformed json', () => {
    const path = join(tempHome, 'session.json')
    mkdirSync(tempHome, { recursive: true })
    writeFileSync(path, '{not json')
    expect(loadActiveTheme()).toBe('dark')
  })

  test('loadActiveTheme defaults to dark when activeTheme is unknown', () => {
    const path = join(tempHome, 'session.json')
    mkdirSync(tempHome, { recursive: true })
    writeFileSync(path, JSON.stringify({ version: 1, activeTheme: 'nonsense' }))
    expect(loadActiveTheme()).toBe('dark')
  })
})
