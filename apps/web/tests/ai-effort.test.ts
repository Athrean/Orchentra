import { describe, expect, it } from 'bun:test'
import { EFFORT_BUDGET_TOKENS, effortToProviderOptions } from '../lib/ai/effort'

describe('effortToProviderOptions', () => {
  it('returns adaptive thinking when adaptive is on (anthropic)', () => {
    expect(effortToProviderOptions('anthropic', 'low', true)).toEqual({
      anthropic: { thinking: { type: 'adaptive' } },
    })
  })

  it('disables thinking at low effort with adaptive off', () => {
    expect(effortToProviderOptions('anthropic', 'low', false)).toEqual({})
  })

  it('enables budgeted thinking for high effort (anthropic)', () => {
    expect(effortToProviderOptions('anthropic', 'high', false)).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: EFFORT_BUDGET_TOKENS.high } },
    })
  })

  it('uses the max budget for max effort', () => {
    const opts = effortToProviderOptions('anthropic', 'max', false)
    expect(opts).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: EFFORT_BUDGET_TOKENS.max } },
    })
    expect(EFFORT_BUDGET_TOKENS.max).toBeGreaterThan(EFFORT_BUDGET_TOKENS.high)
  })

  it('is a no-op for non-anthropic providers', () => {
    expect(effortToProviderOptions('openai', 'high', false)).toEqual({})
    expect(effortToProviderOptions('google', 'max', true)).toEqual({})
  })
})
