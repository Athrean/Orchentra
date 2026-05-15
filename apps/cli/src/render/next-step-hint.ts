/**
 * Single source of truth for the muted, single-line "next step" hint that
 * the CLI prints after certain flows complete. The renderer is intentionally
 * flow-agnostic: callers pass a hint id (and optional context like a runId)
 * and receive the rendered string. Styling — dim/muted via THEME.muted — is
 * applied by the integration site, not by this module, so the function stays
 * a pure string transform that is trivial to test.
 */

export type NextStepHint =
  | { readonly id: 'summarize-completed' }
  | { readonly id: 'triage-completed'; readonly runId: number }

/**
 * Render the hint copy for a given completion event. The returned string is
 * the exact line to print — no decoration, no emoji, no prefix.
 */
export function renderNextStepHint(hint: NextStepHint): string {
  switch (hint.id) {
    case 'summarize-completed':
      return 'Run /fix to apply this recommendation.'
    case 'triage-completed':
      return `Run /summarize ${hint.runId} to extract root cause.`
  }
}
