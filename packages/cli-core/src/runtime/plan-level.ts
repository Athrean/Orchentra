export const PLAN_LEVELS = ['core', 'plus', 'max'] as const

export type PlanLevel = (typeof PLAN_LEVELS)[number]

export function isPlanLevel(value: unknown): value is PlanLevel {
  return typeof value === 'string' && (PLAN_LEVELS as readonly string[]).includes(value)
}

/** Depth/verbosity instruction folded into the architect's system prompt. */
export function planLevelPrompt(level: PlanLevel): string {
  if (level === 'core') {
    return 'PLAN DEPTH: core. Keep every field terse — recommended stack, one alternative, only the essential scaffold and verification. Fewest words that stay correct.'
  }
  if (level === 'max') {
    return 'PLAN DEPTH: max. Be exhaustive — rich rationale that names risks, at least three alternatives each with an explicit tradeoff, a thorough scaffold, and complete verification steps.'
  }
  return 'PLAN DEPTH: plus. Balanced — recommended stack, named alternatives with tradeoffs, architecture, a working scaffold, and verification.'
}
