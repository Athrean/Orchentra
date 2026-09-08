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

// ── Named community palettes ───────────────────────────────────────────────
// Ports of the palettes users already know from other terminal tools. Each
// maps that palette's own roles onto Orchentra's tokens rather than tinting
// the default theme a new hue.

const tokyoNight: Theme = {
  brand: '#7AA2F7',
  brandDim: '#3D59A1',
  fg: '#C0CAF5',
  muted: '#565F89',
  accent: '#7DCFFF',
  warn: '#E0AF68',
  danger: '#F7768E',
  heading: '#7AA2F7',
  headingAlt: '#C0CAF5',
  emphasis: '#7DCFFF',
  strong: '#BB9AF7',
  link: '#7DCFFF',
  quote: '#565F89',
  codeBorder: '#3B4261',
  inlineCode: '#7AA2F7',
  diffAdd: '#9ECE6A',
  diffDel: '#F7768E',
  diffHunk: '#7DCFFF',
  diffFile: '#BB9AF7',
  ...GLYPHS,
  spinner: SPINNER,
}

const catppuccinMocha: Theme = {
  brand: '#89B4FA',
  brandDim: '#585B70',
  fg: '#CDD6F4',
  muted: '#6C7086',
  accent: '#94E2D5',
  warn: '#F9E2AF',
  danger: '#F38BA8',
  heading: '#89B4FA',
  headingAlt: '#CDD6F4',
  emphasis: '#94E2D5',
  strong: '#CBA6F7',
  link: '#89DCEB',
  quote: '#6C7086',
  codeBorder: '#45475A',
  inlineCode: '#89B4FA',
  diffAdd: '#A6E3A1',
  diffDel: '#F38BA8',
  diffHunk: '#89DCEB',
  diffFile: '#CBA6F7',
  ...GLYPHS,
  spinner: SPINNER,
}

const gruvboxDark: Theme = {
  brand: '#B8BB26',
  brandDim: '#79740E',
  fg: '#EBDBB2',
  muted: '#928374',
  accent: '#8EC07C',
  warn: '#FABD2F',
  danger: '#FB4934',
  heading: '#B8BB26',
  headingAlt: '#EBDBB2',
  emphasis: '#8EC07C',
  strong: '#FE8019',
  link: '#83A598',
  quote: '#928374',
  codeBorder: '#504945',
  inlineCode: '#B8BB26',
  diffAdd: '#B8BB26',
  diffDel: '#FB4934',
  diffHunk: '#8EC07C',
  diffFile: '#D3869B',
  ...GLYPHS,
  spinner: SPINNER,
}

const nord: Theme = {
  brand: '#88C0D0',
  brandDim: '#5E81AC',
  fg: '#ECEFF4',
  muted: '#4C566A',
  accent: '#8FBCBB',
  warn: '#EBCB8B',
  danger: '#BF616A',
  heading: '#88C0D0',
  headingAlt: '#ECEFF4',
  emphasis: '#8FBCBB',
  strong: '#B48EAD',
  link: '#81A1C1',
  quote: '#4C566A',
  codeBorder: '#434C5E',
  inlineCode: '#88C0D0',
  diffAdd: '#A3BE8C',
  diffDel: '#BF616A',
  diffHunk: '#88C0D0',
  diffFile: '#B48EAD',
  ...GLYPHS,
  spinner: SPINNER,
}

const dracula: Theme = {
  brand: '#BD93F9',
  brandDim: '#6272A4',
  fg: '#F8F8F2',
  muted: '#6272A4',
  accent: '#8BE9FD',
  warn: '#F1FA8C',
  danger: '#FF5555',
  heading: '#BD93F9',
  headingAlt: '#F8F8F2',
  emphasis: '#8BE9FD',
  strong: '#FF79C6',
  link: '#8BE9FD',
  quote: '#6272A4',
  codeBorder: '#44475A',
  inlineCode: '#BD93F9',
  diffAdd: '#50FA7B',
  diffDel: '#FF5555',
  diffHunk: '#8BE9FD',
  diffFile: '#FF79C6',
  ...GLYPHS,
  spinner: SPINNER,
}

const oneDark: Theme = {
  brand: '#61AFEF',
  brandDim: '#4B5263',
  fg: '#ABB2BF',
  muted: '#5C6370',
  accent: '#56B6C2',
  warn: '#E5C07B',
  danger: '#E06C75',
  heading: '#61AFEF',
  headingAlt: '#ABB2BF',
  emphasis: '#56B6C2',
  strong: '#C678DD',
  link: '#56B6C2',
  quote: '#5C6370',
  codeBorder: '#3E4451',
  inlineCode: '#61AFEF',
  diffAdd: '#98C379',
  diffDel: '#E06C75',
  diffHunk: '#56B6C2',
  diffFile: '#C678DD',
  ...GLYPHS,
  spinner: SPINNER,
}

const matrix: Theme = {
  brand: '#00FF41',
  brandDim: '#008F11',
  fg: '#00E33D',
  muted: '#005F0B',
  accent: '#39FF6A',
  warn: '#B6FF00',
  danger: '#FF3131',
  heading: '#00FF41',
  headingAlt: '#00E33D',
  emphasis: '#39FF6A',
  strong: '#B9FFC4',
  link: '#39FF6A',
  quote: '#005F0B',
  codeBorder: '#00500A',
  inlineCode: '#00FF41',
  diffAdd: '#00FF41',
  diffDel: '#FF3131',
  diffHunk: '#39FF6A',
  diffFile: '#B9FFC4',
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
  tokyonight: tokyoNight,
  catppuccin: catppuccinMocha,
  gruvbox: gruvboxDark,
  nord,
  dracula,
  'one-dark': oneDark,
  matrix,
} as const

export type ThemeName = keyof typeof THEMES

const NAMES: readonly ThemeName[] = [
  'dark',
  'light',
  'dark-ansi',
  'solarized-dark',
  'solarized-light',
  'high-contrast',
  'tokyonight',
  'catppuccin',
  'gruvbox',
  'nord',
  'dracula',
  'one-dark',
  'matrix',
] as const

export function themeNames(): readonly ThemeName[] {
  return NAMES
}

/** One-line description per theme, shared by `/theme list` and the picker. */
export function describeTheme(name: ThemeName): string {
  switch (name) {
    case 'dark':
      return 'Default dark palette · truecolor'
    case 'light':
      return 'Light-mode inverse · for white backgrounds'
    case 'dark-ansi':
      return '16-colour ANSI fallback · plain terminals'
    case 'solarized-dark':
      return 'Solarized dark · low-eyestrain palette'
    case 'solarized-light':
      return 'Solarized light · cream-paper canvas'
    case 'high-contrast':
      return 'High-contrast · WCAG AAA accessible'
    case 'tokyonight':
      return 'Tokyo Night · blue-violet night palette'
    case 'catppuccin':
      return 'Catppuccin Mocha · soft pastel dark'
    case 'gruvbox':
      return 'Gruvbox dark · warm retro earth tones'
    case 'nord':
      return 'Nord · cool arctic blues'
    case 'dracula':
      return 'Dracula · purple-on-charcoal classic'
    case 'one-dark':
      return 'One Dark · Atom/VS Code default dark'
    case 'matrix':
      return 'Matrix · green phosphor terminal'
  }
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
