import React, { createContext, useContext } from 'react'
import { THEMES, type Theme } from './theme-registry'

/**
 * Active-theme context for runtime switching. Components opt in to live
 * previews by reading via `useTheme()`; the legacy `THEME` constant stays
 * pointed at `dark` so the 20+ existing call sites compile unchanged.
 *
 * The provider wraps any subtree that should follow a non-default theme —
 * primarily the picker overlay during live preview, but any future widget
 * can subscribe by switching its import from `theme.ts` to this hook.
 */
const ThemeContext = createContext<Theme>(THEMES.dark)

export interface ThemeProviderProps {
  readonly theme: Theme
  readonly children: React.ReactNode
}

export function ThemeProvider(props: ThemeProviderProps): React.ReactElement {
  return React.createElement(ThemeContext.Provider, { value: props.theme }, props.children)
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
