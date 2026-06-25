import type { UsageTotals } from './events'
import { emptyUsage, addUsage, totalTokens } from './events'

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

const HAIKU_PRICING: ModelPricing = {
  inputCostPerMillion: 1,
  outputCostPerMillion: 5,
  cacheCreationCostPerMillion: 1.25,
  cacheReadCostPerMillion: 0.1,
}

const SONNET_PRICING: ModelPricing = {
  inputCostPerMillion: 3,
  outputCostPerMillion: 15,
  cacheCreationCostPerMillion: 3.75,
  cacheReadCostPerMillion: 0.3,
}

const OPUS_PRICING: ModelPricing = {
  inputCostPerMillion: 15,
  outputCostPerMillion: 75,
  cacheCreationCostPerMillion: 18.75,
  cacheReadCostPerMillion: 1.5,
}

export function pricingForModel(model: string): ModelPricing | undefined {
  const normalized = model.toLowerCase()
  if (normalized.includes('haiku')) {
    return HAIKU_PRICING
  }
  if (normalized.includes('opus')) {
    return OPUS_PRICING
  }
  if (normalized.includes('sonnet')) {
    return SONNET_PRICING
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
  const cost = pricing !== undefined ? estimateCost(usage, pricing) : estimateCost(usage, SONNET_PRICING)

  const suffix = []
  if (model !== undefined) {
    suffix.push(`model=${model}`)
  }
  if (pricing === undefined && model !== undefined) {
    suffix.push('pricing=estimated-default')
  }

  const main = [
    `${label}: total_tokens=${totalTokens(usage)}`,
    `input=${usage.inputTokens}`,
    `output=${usage.outputTokens}`,
    `cache_write=${usage.cacheCreationTokens}`,
    `cache_read=${usage.cacheReadTokens}`,
    `estimated_cost=${formatUsd(totalCostUsd(cost))}`,
    ...suffix,
  ].join(' ')

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

// Total estimated spend for `usage` under the model's pricing. Unknown models
// fall back to Sonnet pricing (same convention as summaryLines) so a configured
// dollar budget still applies rather than silently disabling itself.
export function estimatedCostUsd(usage: UsageTotals, model?: string): number {
  const pricing = (model !== undefined ? pricingForModel(model) : undefined) ?? SONNET_PRICING
  return totalCostUsd(estimateCost(usage, pricing))
}

export class UsageTracker {
  private latestTurn: UsageTotals = emptyUsage()
  private cumulative: UsageTotals = emptyUsage()
  private turnCount: number = 0

  record(usage: UsageTotals): void {
    this.latestTurn = usage
    this.cumulative = addUsage(this.cumulative, usage)
    this.turnCount += 1
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
