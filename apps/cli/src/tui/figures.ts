/**
 * Structural glyphs used across the TUI, centralized so components stop
 * hardcoding them. Theme-attached glyphs (prompt, arrows, check, cross, dot,
 * separator, rule) live on the `Theme` because a palette may restyle them;
 * these are layout/status marks that stay constant across palettes.
 */
export const FIGURES = {
  toolCall: '⏺',
  tree: '⎿',
  thought: '✦',
  gear: '⚙',
  warn: '⚠',
  search: '⌕',
  undo: '↩',
  arrowUp: '↑',
  arrowDown: '↓',
} as const

export type FigureName = keyof typeof FIGURES
