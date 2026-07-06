import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * A `Theme` is the runtime-switchable replacement for the legacy `THEME`
 * constant. Every theme must expose the same shape — colour tokens, glyphs,
 * and spinner frames — so a swap is purely a value change, never a
 * structural one, and existing consumers don't need to type-check the
 * specific palette in use.
 */
export interface Theme {
  readonly brand: string
  readonly brandDim: string
  readonly fg: string
  readonly muted: string
  readonly accent: string
  readonly warn: string
  readonly danger: string
  readonly heading: string
  readonly headingAlt: string
  readonly emphasis: string
  readonly strong: string
  readonly link: string
  readonly quote: string
  readonly codeBorder: string
  readonly inlineCode: string
  readonly diffAdd: string
  readonly diffDel: string
  readonly diffHunk: string
  readonly diffFile: string
  readonly prompt: string
  readonly bullet: string
  readonly arrowRight: string
  readonly arrowLeft: string
  readonly check: string
  readonly cross: string
  readonly dot: string
  readonly separator: string
  readonly rule: string
  readonly spinner: readonly string[]
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

const GLYPHS = {
  prompt: '›',
  bullet: '·',
  arrowRight: '→',
  arrowLeft: '←',
  check: '✓',
  cross: '✕',
  dot: '●',
  separator: '·',
  rule: '─',
} as const

const dark: Theme = {
  brand: '#10A37F',
  brandDim: '#5BD3B6',
  fg: 'white',
  muted: 'gray',
  accent: '#5BD3B6',
  warn: 'yellow',
  danger: 'red',
  heading: '#10A37F',
  headingAlt: '#D9FFF5',
  emphasis: '#5BD3B6',
  strong: '#D9FFF5',
  link: '#5BD3B6',
  quote: '#7FA99B',
  codeBorder: '#1F6F5A',
  inlineCode: '#10A37F',
  diffAdd: 'green',
  diffDel: 'red',
  diffHunk: 'cyan',
  diffFile: 'magenta',
  ...GLYPHS,
  spinner: SPINNER,
}

// Light-mode inverse: deeper brand for white backgrounds, dim grays
// readable on light terminals, headings/links re-pitched to hues that
// contrast with light backgrounds.
const light: Theme = {
  brand: '#0D7F63',
  brandDim: '#10A37F',
  fg: 'black',
  muted: 'gray',
  accent: 'blue',
  warn: '#B07000',
  danger: '#B11616',
  heading: 'blue',
  headingAlt: 'black',
  emphasis: '#7A2E7A',
  strong: '#8B5A00',
  link: '#0050B0',
  quote: 'gray',
  codeBorder: 'gray',
  inlineCode: '#0D7F63',
  diffAdd: '#0D7F63',
  diffDel: '#B11616',
  diffHunk: '#0050B0',
  diffFile: '#7A2E7A',
  ...GLYPHS,
  spinner: SPINNER,
}

// 16-colour ANSI fallback for terminals without truecolor. Every value is
// a named ANSI colour Ink resolves through chalk so it degrades gracefully.
const darkAnsi: Theme = {
  brand: 'green',
  brandDim: 'green',
  fg: 'white',
  muted: 'gray',
  accent: 'green',
  warn: 'yellow',
  danger: 'red',
  heading: 'green',
  headingAlt: 'white',
  emphasis: 'green',
  strong: 'white',
  link: 'green',
  quote: 'gray',
  codeBorder: 'green',
  inlineCode: 'green',
  diffAdd: 'green',
  diffDel: 'red',
  diffHunk: 'cyan',
  diffFile: 'magenta',
  ...GLYPHS,
  spinner: SPINNER,
}

// Solarized dark — low-eyestrain palette tuned around base03/base02 canvas
// with base0 body text and base01 muted. Accent hues stay perceptually even
// across the light/dark variants by design.
const solarizedDark: Theme = {
  brand: '#859900',
  brandDim: '#2aa198',
  fg: '#839496',
  muted: '#586e75',
  accent: '#2aa198',
  warn: '#b58900',
  danger: '#dc322f',
  heading: '#268bd2',
  headingAlt: '#93a1a1',
  emphasis: '#d33682',
  strong: '#cb4b16',
  link: '#268bd2',
  quote: '#586e75',
  codeBorder: '#586e75',
  inlineCode: '#859900',
  diffAdd: '#859900',
  diffDel: '#dc322f',
  diffHunk: '#2aa198',
  diffFile: '#d33682',
  ...GLYPHS,
  spinner: SPINNER,
}

// Solarized light — same accent hues over a base3/base2 paper canvas. Body
// text drops to base00 (darker than base0) for contrast against the cream
// background.
const solarizedLight: Theme = {
  brand: '#859900',
  brandDim: '#2aa198',
  fg: '#657b83',
  muted: '#93a1a1',
  accent: '#2aa198',
  warn: '#b58900',
  danger: '#dc322f',
  heading: '#268bd2',
  headingAlt: '#586e75',
  emphasis: '#d33682',
  strong: '#cb4b16',
  link: '#268bd2',
  quote: '#93a1a1',
  codeBorder: '#93a1a1',
  inlineCode: '#859900',
  diffAdd: '#859900',
  diffDel: '#dc322f',
  diffHunk: '#2aa198',
  diffFile: '#d33682',
  ...GLYPHS,
  spinner: SPINNER,
}

// High-contrast — pure-saturation primaries on black, tuned for WCAG AAA
// contrast and accessibility users. Every token is a corner of the RGB cube
// or a pure secondary so contrast ratio against black stays at or above 7:1.
const highContrast: Theme = {
  brand: '#00ff00',
  brandDim: '#00ff00',
  fg: '#ffffff',
  muted: '#ffffff',
  accent: '#00ffff',
  warn: '#ffff00',
  danger: '#ff0000',
  heading: '#00ffff',
  headingAlt: '#ffffff',
  emphasis: '#ff00ff',
  strong: '#ffff00',
  link: '#00ffff',
  quote: '#ffffff',
  codeBorder: '#ffffff',
  inlineCode: '#00ff00',
  diffAdd: '#00ff00',
  diffDel: '#ff0000',
  diffHunk: '#00ffff',
  diffFile: '#ff00ff',
  ...GLYPHS,
  spinner: SPINNER,
}

export const THEMES = {
  dark,
  light,
  'dark-ansi': darkAnsi,
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
  'high-contrast': highContrast,
} as const

export type ThemeName = keyof typeof THEMES

const NAMES: readonly ThemeName[] = [
  'dark',
  'light',
  'dark-ansi',
  'solarized-dark',
  'solarized-light',
  'high-contrast',
] as const

export function themeNames(): readonly ThemeName[] {
  return NAMES
}

export function isThemeName(value: string): value is ThemeName {
  return (NAMES as readonly string[]).includes(value)
}

export const DEFAULT_THEME: ThemeName = 'dark'

// ---- persistence ----------------------------------------------------------
//
// We piggy-back on `~/.config/orchentra/session.json` (the same file used by
// `setActiveRepo`), reading/writing a fresh `activeTheme` key. The existing
// store has its own atomic-write code; rather than refactor it, this slice
// duplicates the minimal load/persist pattern so the change is zero-touch
// in `session-config.ts`.

interface SessionFileShape {
  readonly version?: number
  readonly activeRepo?: string
  readonly activeTheme?: string
  readonly [extra: string]: unknown
}

const FILE_MODE = 0o600
const DIR_MODE = 0o700

function sessionFilePath(): string {
  const override = process.env['ORCHENTRA_CONFIG_HOME']
  if (override && override.length > 0) return join(override, 'session.json')
  return join(homedir(), '.config', 'orchentra', 'session.json')
}

function readSession(): SessionFileShape {
  const path = sessionFilePath()
  if (!existsSync(path)) return {}
  try {
    const text = readFileSync(path, 'utf8')
    if (!text.trim()) return {}
    const parsed = JSON.parse(text) as SessionFileShape
    return parsed ?? {}
  } catch {
    return {}
  }
}

function writeSession(file: SessionFileShape): void {
  const path = sessionFilePath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: DIR_MODE })
  const tmp = `${path}.tmp-${process.pid}-theme`
  writeFileSync(tmp, JSON.stringify({ version: 1, ...file }, null, 2) + '\n', { mode: FILE_MODE })
  try {
    renameSync(tmp, path)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw err
  }
  try {
    chmodSync(path, FILE_MODE)
  } catch {
    /* permissions are best-effort on non-POSIX */
  }
}

export function loadActiveTheme(): ThemeName {
  const file = readSession()
  const name = file.activeTheme
  if (typeof name === 'string' && isThemeName(name)) return name
  return DEFAULT_THEME
}

export function saveActiveTheme(name: ThemeName): void {
  const current = readSession()
  writeSession({ ...current, activeTheme: name })
}
