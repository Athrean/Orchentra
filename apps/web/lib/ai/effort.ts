import type { ProviderId } from '../ai-providers/catalog'

export const efforts = ['low', 'medium', 'high', 'max'] as const
export type Effort = (typeof efforts)[number]

/** Extended-thinking token budgets per effort tier (Anthropic). `low` means no thinking. */
export const EFFORT_BUDGET_TOKENS: Record<Effort, number> = {
  low: 0,
  medium: 4_096,
  high: 12_000,
  max: 24_000,
}

/**
 * Map a chat-input effort tier + adaptive-thinking toggle to AI SDK `providerOptions`.
 * Anthropic is the only provider we wire thinking for today; others are a no-op.
 */
export function effortToProviderOptions(
  provider: ProviderId,
  effort: Effort,
  adaptive: boolean,
): Record<string, Record<string, unknown>> {
  if (provider !== 'anthropic') return {}

  if (adaptive) {
    return { anthropic: { thinking: { type: 'adaptive' } } }
  }

  const budgetTokens = EFFORT_BUDGET_TOKENS[effort]
  if (budgetTokens <= 0) return {}

  return { anthropic: { thinking: { type: 'enabled', budgetTokens } } }
}
