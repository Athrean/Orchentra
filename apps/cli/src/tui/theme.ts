import type { PermissionMode } from '@orchentra/cli-core'
import { THEMES, type Theme, type ThemeName } from './theme-registry'

/**
 * Single source of truth for TUI styling. Every component should import
 * tokens from here rather than hard-coding colours, glyphs, or separators.
 *
 * `THEME` is a live binding: consumers read `THEME.*` at render time, so
 * `setActiveTheme` restyles the whole tree on the next render without any
 * per-call-site change. It defaults to `dark` and is pointed at the
 * persisted theme at launch (see `runTui`) and on each `/theme` apply.
 */
export let THEME: Theme = THEMES.dark

/**
 * Swap the active theme for every `THEME.*` consumer. Idempotent; safe to
 * call before the first render (launch) or mid-session (theme picker) — the
 * caller triggers the re-render that repaints the live zone.
 */
export function setActiveTheme(name: ThemeName): void {
  THEME = THEMES[name]
}

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
