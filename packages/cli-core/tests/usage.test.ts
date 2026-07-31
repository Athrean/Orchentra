import { describe, expect, test } from 'bun:test'
import {
  pricingForModel,
  estimateCost,
  formatUsd,
  summaryLines,
  UsageTracker,
  billedTokens,
  cachedTokens,
} from '../src/runtime/usage'
import { emptyUsage, type UsageTotals } from '../src/runtime/events'

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

  test('returns current opus pricing, not the retired $15/$75 tier', () => {
    const p = pricingForModel('claude-opus-4-6')
    expect(p).toEqual({
      inputCostPerMillion: 5,
      outputCostPerMillion: 25,
      cacheCreationCostPerMillion: 6.25,
      cacheReadCostPerMillion: 0.5,
    })
  })

  // Opus 4.1 and Opus 4 kept the old tier when 4.5 onward dropped to $5/$25.
  // A single `includes('opus')` match would price every Opus at one of these.
  test('prices retired Opus 4.1 and Opus 4 at the old tier', () => {
    for (const id of ['claude-opus-4-1-20250805', 'claude-opus-4-20250514']) {
      expect(pricingForModel(id)).toEqual({
        inputCostPerMillion: 15,
        outputCostPerMillion: 75,
        cacheCreationCostPerMillion: 18.75,
        cacheReadCostPerMillion: 1.5,
      })
    }
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

  // Sonnet 5 is $2/$10 through 2026-08-31 and $3/$15 from 2026-09-01. Both
  // dates are pinned so the cutover happens on schedule rather than whenever
  // someone next reads an invoice.
  test('switches Sonnet 5 off introductory pricing on 2026-09-01', () => {
    const intro = pricingForModel('claude-sonnet-5', new Date('2026-08-31T23:59:59Z'))
    expect(intro).toMatchObject({ inputCostPerMillion: 2, outputCostPerMillion: 10 })
    const standard = pricingForModel('claude-sonnet-5', new Date('2026-09-01T00:00:00Z'))
    expect(standard).toMatchObject({ inputCostPerMillion: 3, outputCostPerMillion: 15 })
  })

  test('prices the pre-4.x id spelling that puts the version first', () => {
    expect(pricingForModel('claude-3-5-sonnet-20241022')).toMatchObject({
      inputCostPerMillion: 3,
      outputCostPerMillion: 15,
    })
  })

  test('prices Fable 5', () => {
    expect(pricingForModel('claude-fable-5')).toEqual({
      inputCostPerMillion: 10,
      outputCostPerMillion: 50,
      cacheCreationCostPerMillion: 12.5,
      cacheReadCostPerMillion: 1,
    })
  })

  // Ids appear with dots (`gpt-5.6-sol`) and dashes (`gpt-5-6-sol`) depending
  // on the caller, and OpenRouter prefixes a vendor (`z-ai/glm-5.2`).
  test.each([
    ['gpt-5.6-sol', 5, 30],
    ['gpt-5-6-sol', 5, 30],
    ['gpt-5.6-terra', 2, 12],
    ['gpt-5.6-luna', 0.2, 1.2],
    ['gpt-5.4-mini', 0.75, 4.5],
    ['gpt-5.4', 2.5, 15],
    ['kimi-k3', 3, 15],
    ['kimi-k2.7-code', 0.95, 4],
    ['kimi-k2.7-code-highspeed', 1.9, 8],
    ['z-ai/glm-5.2', 1.4, 4.4],
    ['glm-5', 1, 3.2],
    ['glm-4.7', 0.6, 2.2],
    ['glm-4.7-flashx', 0.07, 0.4],
  ])('prices %s at $%d in / $%d out per million', (id, input, output) => {
    expect(pricingForModel(id)).toMatchObject({
      inputCostPerMillion: input,
      outputCostPerMillion: output,
    })
  })

  // Ordering bug guard: `flashx` must be matched before `flash`, and the
  // sized GLM 4.5 variants before the bare family entry.
  test('prefers the more specific pattern when families overlap', () => {
    expect(pricingForModel('glm-4.7-flash')).toMatchObject({ inputCostPerMillion: 0 })
    expect(pricingForModel('glm-4.5-air')).toMatchObject({ inputCostPerMillion: 0.2 })
    expect(pricingForModel('glm-4.5-airx')).toMatchObject({ inputCostPerMillion: 1.1 })
    expect(pricingForModel('glm-4.5')).toMatchObject({ inputCostPerMillion: 0.6 })
  })

  test('returns undefined for unknown model', () => {
    expect(pricingForModel('custom-model')).toBeUndefined()
    expect(pricingForModel('deepseek/deepseek-v4-pro')).toBeUndefined()
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

  test('buckets output tokens and turns by terse mode', () => {
    const tracker = new UsageTracker()
    const turn = (output: number): UsageTotals => ({
      inputTokens: 100,
      outputTokens: output,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    })
    tracker.record(turn(800)) // defaults to 'off'
    tracker.record(turn(900), 'off')
    tracker.record(turn(400), 'full')

    expect(tracker.terseBreakdown()).toEqual([
      { mode: 'off', outputTokens: 1700, turns: 2 },
      { mode: 'full', outputTokens: 400, turns: 1 },
    ])
  })

  test('terseBreakdown is empty before any turn', () => {
    expect(new UsageTracker().terseBreakdown()).toEqual([])
  })

  test('terseBreakdown is ordered by canonical terse-mode order', () => {
    const tracker = new UsageTracker()
    const turn = { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 }
    tracker.record(turn, 'ultra')
    tracker.record(turn, 'lite')
    expect(tracker.terseBreakdown().map((b) => b.mode)).toEqual(['lite', 'ultra'])
  })

  test('savings start at zero', () => {
    expect(new UsageTracker().savings()).toEqual({
      compactions: 0,
      compactionTokensSaved: 0,
      toolOutputTrims: 0,
      toolOutputCharsTrimmed: 0,
    })
  })

  test('accumulates measured compaction and tool-output-trim savings', () => {
    const tracker = new UsageTracker()
    tracker.recordCompaction(1200)
    tracker.recordCompaction(300)
    tracker.recordToolOutputTrim(70_000)

    expect(tracker.savings()).toEqual({
      compactions: 2,
      compactionTokensSaved: 1500,
      toolOutputTrims: 1,
      toolOutputCharsTrimmed: 70_000,
    })
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
    // Billed-vs-cache split: cache reads are the cheap path and never lumped
    // into the billed figure.
    expect(lines[0]).toContain('billed=1600000')
    expect(lines[0]).toContain('cached=200000')
    expect(lines[1]).toContain('input=$3.0000')
    expect(lines[1]).toContain('output=$7.5000')
    expect(lines[1]).toContain('cache_read=$0.0600')
  })

  // The previous behaviour substituted Sonnet pricing here and printed a real
  // dollar figure for a model it had never heard of. A fabricated number is
  // indistinguishable from a measured one, so there must be no number at all.
  test('with unknown model reports cost as unknown, never a substituted rate', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 100,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    const lines = summaryLines(usage, 'usage', 'custom-model')

    expect(lines[0]).toContain('estimated_cost=unknown')
    expect(lines[0]).toContain('model=custom-model')
    expect(lines[0]).not.toContain('$')
    expect(lines[1]).toContain('unavailable')
    expect(lines[1]).not.toContain('$')
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

describe('billed-vs-cache token split', () => {
  const usage = {
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 200,
    cacheReadTokens: 90_000,
  }

  test('billedTokens excludes cache reads', () => {
    expect(billedTokens(usage)).toBe(1700)
  })

  test('cachedTokens is the cache-read count', () => {
    expect(cachedTokens(usage)).toBe(90_000)
  })
})
