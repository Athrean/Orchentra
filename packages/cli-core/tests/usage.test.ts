import { describe, expect, test } from 'bun:test'
import { pricingForModel, estimateCost, formatUsd, summaryLines, UsageTracker } from '../src/runtime/usage'
import { emptyUsage } from '../src/runtime/events'

describe('pricingForModel', () => {
  test('returns haiku pricing', () => {
    const p = pricingForModel('claude-haiku-4-5-20251001')
    expect(p).toEqual({
      inputCostPerMillion: 1,
      outputCostPerMillion: 5,
      cacheCreationCostPerMillion: 1.25,
      cacheReadCostPerMillion: 0.1,
    })
  })

  test('returns opus pricing', () => {
    const p = pricingForModel('claude-opus-4-6')
    expect(p).toEqual({
      inputCostPerMillion: 15,
      outputCostPerMillion: 75,
      cacheCreationCostPerMillion: 18.75,
      cacheReadCostPerMillion: 1.5,
    })
  })

  test('returns sonnet pricing', () => {
    const p = pricingForModel('claude-sonnet-4-20250514')
    expect(p).toEqual({
      inputCostPerMillion: 3,
      outputCostPerMillion: 15,
      cacheCreationCostPerMillion: 3.75,
      cacheReadCostPerMillion: 0.3,
    })
  })

  test('returns undefined for unknown model', () => {
    expect(pricingForModel('custom-model')).toBeUndefined()
  })
})

describe('estimateCost', () => {
  test('produces correct dollar amounts', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheCreationTokens: 100_000,
      cacheReadTokens: 200_000,
    }
    const sonnet = pricingForModel('claude-sonnet-4-20250514')!
    const cost = estimateCost(usage, sonnet)

    expect(formatUsd(cost.inputCostUsd)).toBe('$3.0000')
    expect(formatUsd(cost.outputCostUsd)).toBe('$7.5000')
    expect(formatUsd(cost.cacheCreationCostUsd)).toBe('$0.3750')
    expect(formatUsd(cost.cacheReadCostUsd)).toBe('$0.0600')
  })
})

describe('formatUsd', () => {
  test('formats correctly', () => {
    expect(formatUsd(15)).toBe('$15.0000')
    expect(formatUsd(37.5)).toBe('$37.5000')
    expect(formatUsd(0.3)).toBe('$0.3000')
    expect(formatUsd(0)).toBe('$0.0000')
  })
})

describe('UsageTracker', () => {
  test('accumulates across turns and tracks cumulative totals', () => {
    const tracker = new UsageTracker()
    tracker.record({
      inputTokens: 10,
      outputTokens: 4,
      cacheCreationTokens: 2,
      cacheReadTokens: 1,
    })
    tracker.record({
      inputTokens: 20,
      outputTokens: 6,
      cacheCreationTokens: 3,
      cacheReadTokens: 2,
    })

    expect(tracker.turns()).toBe(2)

    const current = tracker.currentTurnUsage()
    expect(current.inputTokens).toBe(20)
    expect(current.outputTokens).toBe(6)

    const cumulative = tracker.cumulativeUsage()
    expect(cumulative.inputTokens).toBe(30)
    expect(cumulative.outputTokens).toBe(10)
    expect(cumulative.cacheCreationTokens).toBe(5)
    expect(cumulative.cacheReadTokens).toBe(3)
  })

  test('returns empty usage when no turns recorded', () => {
    const tracker = new UsageTracker()
    expect(tracker.turns()).toBe(0)
    expect(tracker.cumulativeUsage()).toEqual(emptyUsage())
  })
})

describe('summaryLines', () => {
  test('includes model name and estimated_cost', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheCreationTokens: 100_000,
      cacheReadTokens: 200_000,
    }
    const lines = summaryLines(usage, 'usage', 'claude-sonnet-4-20250514')

    expect(lines[0]).toContain('model=claude-sonnet-4-20250514')
    expect(lines[0]).toContain('estimated_cost=$10.9350')
    expect(lines[0]).toContain('total_tokens=1800000')
    expect(lines[1]).toContain('input=$3.0000')
    expect(lines[1]).toContain('output=$7.5000')
    expect(lines[1]).toContain('cache_read=$0.0600')
  })

  test('with unknown model shows pricing=estimated-default', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 100,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    const lines = summaryLines(usage, 'usage', 'custom-model')

    expect(lines[0]).toContain('pricing=estimated-default')
    expect(lines[0]).toContain('model=custom-model')
  })

  test('without model omits model and pricing suffixes', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    const lines = summaryLines(usage, 'usage')

    expect(lines[0]).not.toContain('model=')
    expect(lines[0]).not.toContain('pricing=')
  })
})
