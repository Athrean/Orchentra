import type { PermissionMode } from '@orchentra/cli-core'

/**
 * Single source of truth for TUI styling. Every component should import
 * tokens from here rather than hard-coding colours, glyphs, or separators.
 */
export const THEME = {
  // Brand
  brand: '#156545',
  brandDim: '#23A470',

  // Semantic accents
  fg: 'white',
  muted: 'gray',
  accent: 'cyan',
  warn: 'yellow',
  danger: 'red',

  // Markdown / content palette (Claude Code-like).
  // Brand stays for branding moments (banner, prompt glyph, list markers,
  // headings level 1); the rest follow the wider terminal-renderer palette.
  heading: 'cyan',
  headingAlt: 'white',
  emphasis: 'magenta',
  strong: 'yellow',
  link: 'blue',
  quote: 'gray',
  codeBorder: 'gray',
  inlineCode: '#23A470',

  // Glyphs
  prompt: '›',
  bullet: '·',
  arrowRight: '→',
  arrowLeft: '←',
  check: '✓',
  cross: '✕',
  dot: '●',

  // Layout
  separator: '·',
  rule: '─',

  // Status
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const,
} as const

export type ThemeColor = string

export function modeAccent(mode: PermissionMode): ThemeColor {
  switch (mode) {
    case 'read-only':
      return THEME.accent
    case 'workspace-write':
      return THEME.brand
    case 'allow':
      return THEME.warn
    case 'danger-full-access':
      return THEME.danger
    case 'prompt':
      return THEME.fg
  }
}

export type TurnState = 'idle' | 'running' | 'cancelling'

export function statusGlyph(state: TurnState): string {
  switch (state) {
    case 'idle':
      return THEME.dot
    case 'running':
      return THEME.spinner[0]
    case 'cancelling':
      return THEME.cross
  }
}
