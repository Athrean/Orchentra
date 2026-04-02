import { describe, it, expect } from 'bun:test'
import { estimateCostUsd } from '../src/agent/token-cost'

describe('estimateCostUsd', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('anthropic/claude-3-5-sonnet', 0, 0)).toBe(0)
  })

  it('calculates cost for exact-match model', () => {
    // claude-3-5-sonnet: $3/M input, $15/M output
    // 1_000_000 input + 1_000_000 output = $18
    expect(estimateCostUsd('anthropic/claude-3-5-sonnet', 1_000_000, 1_000_000)).toBeCloseTo(18.0)
  })

  it('calculates cost for gpt-4o', () => {
    // $2.5/M input + $10/M output
    // 500_000 input + 200_000 output = 1.25 + 2.00 = $3.25
    expect(estimateCostUsd('openai/gpt-4o', 500_000, 200_000)).toBeCloseTo(3.25)
  })

  it('strips variant suffix for prefix match', () => {
    // "anthropic/claude-3-5-sonnet:beta" → same rates as "anthropic/claude-3-5-sonnet"
    const withVariant = estimateCostUsd('anthropic/claude-3-5-sonnet:beta', 100_000, 50_000)
    const withoutVariant = estimateCostUsd('anthropic/claude-3-5-sonnet', 100_000, 50_000)
    expect(withVariant).toBeCloseTo(withoutVariant)
  })

  it('falls back to conservative rates for unknown model', () => {
    // Fallback: $3/M input, $15/M output (same as claude-3-5-sonnet)
    const cost = estimateCostUsd('some/unknown-model-9000', 1_000_000, 0)
    expect(cost).toBeCloseTo(3.0) // $3 for 1M input tokens at fallback rates
  })

  it('uses haiku rates for haiku model', () => {
    // claude-3-haiku: $0.25/M input, $1.25/M output
    // 2_000_000 input = $0.50
    expect(estimateCostUsd('anthropic/claude-3-haiku', 2_000_000, 0)).toBeCloseTo(0.5)
  })

  it('calculates cost for gemini flash with fractional cents', () => {
    // $0.075/M input, $0.3/M output
    // 100_000 input + 50_000 output = 0.0075 + 0.015 = $0.0225
    expect(estimateCostUsd('google/gemini-flash-1.5', 100_000, 50_000)).toBeCloseTo(0.0225)
  })

  it('handles large token counts without precision loss', () => {
    // 10M input + 2M output for claude-3-5-sonnet: 30 + 30 = $60
    const cost = estimateCostUsd('anthropic/claude-3-5-sonnet', 10_000_000, 2_000_000)
    expect(cost).toBeCloseTo(60.0)
  })
})
