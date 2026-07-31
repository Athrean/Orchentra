import type { UsageTotals } from './events'
import { emptyUsage, addUsage, totalTokens } from './events'
import { TERSE_MODES, type TerseMode } from './terse'

export interface TerseModeUsage {
  mode: TerseMode
  outputTokens: number
  turns: number
}

/**
 * Measured spine savings for a session — real numbers from the runtime's own
 * accounting (compaction results, tool-output budget trims), never estimates
 * invented for display.
 */
export interface SpineSavings {
  compactions: number
  compactionTokensSaved: number
  toolOutputTrims: number
  toolOutputCharsTrimmed: number
}

export interface ModelPricing {
  inputCostPerMillion: number
  outputCostPerMillion: number
  cacheCreationCostPerMillion: number
  cacheReadCostPerMillion: number
}

export interface UsageCostEstimate {
  inputCostUsd: number
  outputCostUsd: number
  cacheCreationCostUsd: number
  cacheReadCostUsd: number
}

/**
 * Prices in USD per million tokens, verified 2026-07-31 against each vendor's
 * own pricing page (see `docs/planning/06-DECISION-LOG.md` for the sources).
 *
 * `cacheCreationCostPerMillion` is the *short-lived* cache-write rate, because
 * that is what the runtime's `cacheCreationTokens` counter measures. Anthropic
 * charges 1.25x base input for a 5-minute write and 2x for a 1-hour write; a
 * caller using 1h breakpoints is under-billed by this table. Vendors that do
 * not surcharge cache writes at all are listed at their base input rate.
 *
 * Rates move. This table is a point-in-time snapshot, not a live feed — treat a
 * cost readout as an estimate and reconcile against the vendor invoice.
 */
function price(
  inputCostPerMillion: number,
  outputCostPerMillion: number,
  cacheCreationCostPerMillion: number,
  cacheReadCostPerMillion: number,
): ModelPricing {
  return {
    inputCostPerMillion,
    outputCostPerMillion,
    cacheCreationCostPerMillion,
    cacheReadCostPerMillion,
  }
}

/**
 * Sonnet 5 runs at introductory pricing through 2026-08-31 UTC and reverts to
 * the standard rate on 2026-09-01. Both are recorded so the switch happens on
 * the day rather than whenever someone notices the invoice.
 */
const SONNET_5_STANDARD_FROM = Date.UTC(2026, 8, 1)
const SONNET_5_INTRODUCTORY = price(2, 10, 2.5, 0.2)
const SONNET_5_STANDARD = price(3, 15, 3.75, 0.3)

/**
 * Matched in order, first hit wins, so narrower patterns must come first —
 * `opus-4-1` before `opus`, `flashx` before `flash`. Patterns run against the
 * model id lowercased with dots folded to dashes, so `gpt-5.6-sol` and
 * `gpt-5-6-sol` both match one entry.
 */
const PRICING_TABLE: ReadonlyArray<readonly [RegExp, ModelPricing]> = [
  // ── Anthropic ──────────────────────────────────────────────────────────
  // Fable 5 and Mythos 5 share a price point.
  [/fable|mythos/, price(10, 50, 12.5, 1)],
  // Opus 4.1 and Opus 4 are the old $15/$75 tier; every later Opus is $5/$25.
  // This must precede the general Opus entry.
  [/opus-4-1|opus-4-2025|opus-4$/, price(15, 75, 18.75, 1.5)],
  [/opus/, price(5, 25, 6.25, 0.5)],
  // Sonnet 3.5 and Haiku 3.5 predate the `claude-<family>-<version>` id scheme
  // and put the version first (`claude-3-5-sonnet-20241022`), so both spellings
  // are matched.
  [/sonnet-4|sonnet-3|3-5-sonnet/, price(3, 15, 3.75, 0.3)],
  [/haiku-3|3-5-haiku/, price(0.8, 4, 1, 0.08)],
  [/haiku/, price(1, 5, 1.25, 0.1)],

  // ── OpenAI ─────────────────────────────────────────────────────────────
  // Cache writes are not surcharged, so the write rate is the input rate.
  // Luna (-80%) and Terra (-20%) were cut on 2026-07-30; Sol was not.
  [/gpt-5-6-sol/, price(5, 30, 5, 0.5)],
  [/gpt-5-6-terra/, price(2, 12, 2, 0.2)],
  [/gpt-5-6-luna/, price(0.2, 1.2, 0.2, 0.02)],
  [/gpt-5-5/, price(5, 30, 5, 0.5)],
  // The 5.4 family is priced per context tier. These are the short-context
  // (<272k) rates; a run past that threshold is billed roughly 2x and this
  // table will under-report it.
  [/gpt-5-4-pro/, price(30, 180, 30, 30)],
  [/gpt-5-4-nano/, price(0.2, 1.25, 0.2, 0.02)],
  [/gpt-5-4-mini/, price(0.75, 4.5, 0.75, 0.075)],
  [/gpt-5-4/, price(2.5, 15, 2.5, 0.25)],
  [/gpt-5-1/, price(1.25, 10, 1.25, 0.125)],

  // ── Moonshot (Kimi) ────────────────────────────────────────────────────
  [/kimi-k3/, price(3, 15, 3, 0.3)],
  [/kimi-k2-7-code-highspeed/, price(1.9, 8, 1.9, 0.38)],
  [/kimi-k2-7/, price(0.95, 4, 0.95, 0.19)],

  // ── Z.ai (GLM) ─────────────────────────────────────────────────────────
  [/glm-5-2|glm-5-1/, price(1.4, 4.4, 1.4, 0.26)],
  [/glm-5-turbo/, price(1.2, 4, 1.2, 0.24)],
  [/glm-5/, price(1, 3.2, 1, 0.2)],
  [/glm-4-7-flashx/, price(0.07, 0.4, 0.07, 0.01)],
  [/glm-4-7-flash|glm-4-5-flash/, price(0, 0, 0, 0)],
  [/glm-4-5-airx/, price(1.1, 4.5, 1.1, 0.22)],
  [/glm-4-5-air/, price(0.2, 1.1, 0.2, 0.03)],
  [/glm-4-5-x/, price(2.2, 8.9, 2.2, 0.45)],
  [/glm-4-7|glm-4-6|glm-4-5/, price(0.6, 2.2, 0.6, 0.11)],
]

/**
 * Published pricing for `model`, or undefined when the model is not in the
 * table.
 *
 * Undefined means "unknown", never "free" and never "assume Sonnet". Callers
 * must surface the gap rather than substitute a placeholder rate — an invented
 * dollar figure reads exactly like a real one, and a budget enforced against it
 * is enforcing a fiction.
 */
export function pricingForModel(model: string, now: Date = new Date()): ModelPricing | undefined {
  const normalized = model.toLowerCase().split('.').join('-')
  if (/sonnet-5/.test(normalized)) {
    return now.getTime() >= SONNET_5_STANDARD_FROM ? SONNET_5_STANDARD : SONNET_5_INTRODUCTORY
  }
  for (const [pattern, pricing] of PRICING_TABLE) {
    if (pattern.test(normalized)) return pricing
  }
  return undefined
}

export function estimateCost(usage: UsageTotals, pricing: ModelPricing): UsageCostEstimate {
  return {
    inputCostUsd: costForTokens(usage.inputTokens, pricing.inputCostPerMillion),
    outputCostUsd: costForTokens(usage.outputTokens, pricing.outputCostPerMillion),
    cacheCreationCostUsd: costForTokens(usage.cacheCreationTokens, pricing.cacheCreationCostPerMillion),
    cacheReadCostUsd: costForTokens(usage.cacheReadTokens, pricing.cacheReadCostPerMillion),
  }
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`
}

function totalCostUsd(cost: UsageCostEstimate): number {
  return cost.inputCostUsd + cost.outputCostUsd + cost.cacheCreationCostUsd + cost.cacheReadCostUsd
}

export function summaryLines(usage: UsageTotals, label: string, model?: string): string[] {
  const pricing = model !== undefined ? pricingForModel(model) : undefined

  const suffix = []
  if (model !== undefined) {
    suffix.push(`model=${model}`)
  }

  const main = [
    `${label}: total_tokens=${totalTokens(usage)}`,
    `billed=${billedTokens(usage)}`,
    `cached=${cachedTokens(usage)}`,
    `input=${usage.inputTokens}`,
    `output=${usage.outputTokens}`,
    `cache_write=${usage.cacheCreationTokens}`,
    `cache_read=${usage.cacheReadTokens}`,
    // No pricing means no number. Reporting a placeholder rate here would print
    // a dollar figure indistinguishable from a real one.
    pricing === undefined
      ? 'estimated_cost=unknown'
      : `estimated_cost=${formatUsd(totalCostUsd(estimateCost(usage, pricing)))}`,
    ...suffix,
  ].join(' ')

  if (pricing === undefined) {
    return [main, `  cost breakdown: unavailable (no published pricing for ${model ?? 'unspecified model'})`]
  }

  const cost = estimateCost(usage, pricing)
  const breakdown = [
    '  cost breakdown:',
    `input=${formatUsd(cost.inputCostUsd)}`,
    `output=${formatUsd(cost.outputCostUsd)}`,
    `cache_write=${formatUsd(cost.cacheCreationCostUsd)}`,
    `cache_read=${formatUsd(cost.cacheReadCostUsd)}`,
  ].join(' ')

  return [main, breakdown]
}

export function costForTokens(tokens: number, usdPerMillion: number): number {
  return (tokens / 1_000_000) * usdPerMillion
}

/**
 * Tokens billed at full input/output/cache-write rates. Cache reads are the
 * cheap path (~10% of input rate) — lumping them into one total overstates
 * what a run actually cost, so accounting reports the split, not just a sum.
 */
export function billedTokens(u: UsageTotals): number {
  return u.inputTokens + u.outputTokens + u.cacheCreationTokens
}

export function cachedTokens(u: UsageTotals): number {
  return u.cacheReadTokens
}

/**
 * Total estimated spend for `usage`, or undefined when the model has no
 * published pricing in the table.
 *
 * Undefined propagates deliberately. The previous behaviour substituted Sonnet
 * pricing for anything unrecognised, which billed a cheap open-weight model at
 * roughly an order of magnitude over and handed the dollar budget a number that
 * had nothing to do with the account. A dollar cap that cannot be computed is
 * inert; `maxTokens` is model-independent and still bounds the run.
 */
export function estimatedCostUsd(usage: UsageTotals, model?: string): number | undefined {
  const pricing = model !== undefined ? pricingForModel(model) : undefined
  if (pricing === undefined) return undefined
  return totalCostUsd(estimateCost(usage, pricing))
}

export class UsageTracker {
  private latestTurn: UsageTotals = emptyUsage()
  private cumulative: UsageTotals = emptyUsage()
  private turnCount: number = 0
  // Output tokens + turns spent under each terse mode. Terse mode only shapes
  // generation, so attribution is output-only; the avg output/turn drop across
  // modes is the inspectable efficiency evidence (no fabricated baseline).
  private readonly byTerseMode = new Map<TerseMode, { outputTokens: number; turns: number }>()
  private readonly spineSavings: SpineSavings = {
    compactions: 0,
    compactionTokensSaved: 0,
    toolOutputTrims: 0,
    toolOutputCharsTrimmed: 0,
  }

  record(usage: UsageTotals, terseMode: TerseMode = 'off'): void {
    this.latestTurn = usage
    this.cumulative = addUsage(this.cumulative, usage)
    this.turnCount += 1

    const bucket = this.byTerseMode.get(terseMode) ?? { outputTokens: 0, turns: 0 }
    bucket.outputTokens += usage.outputTokens
    bucket.turns += 1
    this.byTerseMode.set(terseMode, bucket)
  }

  recordCompaction(tokensSaved: number): void {
    this.spineSavings.compactions += 1
    this.spineSavings.compactionTokensSaved += tokensSaved
  }

  recordToolOutputTrim(droppedChars: number): void {
    this.spineSavings.toolOutputTrims += 1
    this.spineSavings.toolOutputCharsTrimmed += droppedChars
  }

  savings(): SpineSavings {
    return { ...this.spineSavings }
  }

  terseBreakdown(): TerseModeUsage[] {
    return TERSE_MODES.filter((mode) => this.byTerseMode.has(mode)).map((mode) => ({
      mode,
      ...this.byTerseMode.get(mode)!,
    }))
  }

  currentTurnUsage(): UsageTotals {
    return this.latestTurn
  }

  cumulativeUsage(): UsageTotals {
    return this.cumulative
  }

  turns(): number {
    return this.turnCount
  }
}
