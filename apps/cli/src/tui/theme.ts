import type { PermissionMode } from '@orchentra/cli-core'
import { THEMES, type Theme } from './theme-registry'

/**
 * Single source of truth for TUI styling. Every component should import
 * tokens from here rather than hard-coding colours, glyphs, or separators.
 *
 * `THEME` is a stable re-export of the `dark` theme from the registry so
 * the 20+ existing consumers compile unchanged. Code that needs runtime
 * switching (e.g. live preview in the picker) should call `useTheme()`
 * instead.
 */
export const THEME: Theme = THEMES.dark

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
