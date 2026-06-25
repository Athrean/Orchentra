import { type UsageTotals, addUsage, emptyUsage, totalTokens } from './events'
import { estimatedCostUsd } from './usage'

export interface BudgetConfig {
  maxSteps: number
  maxTokens: number
  /** Hard-stop the loop once estimated spend reaches this many USD. */
  maxCostUsd?: number
  /** Emit a one-time warning once estimated spend reaches this many USD. */
  warnCostUsd?: number
  /** Model id, used to price usage for the dollar budget. */
  model?: string
}

export interface BudgetState {
  steps: number
  usage: UsageTotals
  costUsd: number
  exhausted: boolean
  exhaustedBy?: 'steps' | 'tokens' | 'cost'
}

export interface CostWarning {
  costUsd: number
  thresholdUsd: number
}

export class RuntimeBudget {
  private steps = 0
  private usage: UsageTotals = emptyUsage()
  private warned = false

  constructor(private readonly config: BudgetConfig) {
    if (config.maxSteps <= 0) {
      throw new Error('budget.maxSteps must be positive')
    }
    if (config.maxTokens <= 0) {
      throw new Error('budget.maxTokens must be positive')
    }
  }

  tickStep(): void {
    this.steps += 1
  }

  addUsage(turn: UsageTotals): void {
    this.usage = addUsage(this.usage, turn)
  }

  private costUsd(): number {
    return estimatedCostUsd(this.usage, this.config.model)
  }

  snapshot(): BudgetState {
    const costUsd = this.costUsd()
    const base = { steps: this.steps, usage: this.usage, costUsd }
    if (this.steps >= this.config.maxSteps) {
      return { ...base, exhausted: true, exhaustedBy: 'steps' }
    }
    if (totalTokens(this.usage) >= this.config.maxTokens) {
      return { ...base, exhausted: true, exhaustedBy: 'tokens' }
    }
    if (this.config.maxCostUsd !== undefined && costUsd >= this.config.maxCostUsd) {
      return { ...base, exhausted: true, exhaustedBy: 'cost' }
    }
    return { ...base, exhausted: false }
  }

  /**
   * Returns the cost warning the first time spend crosses `warnCostUsd`, then
   * `null` on every subsequent call. No-op when no warn threshold is set.
   */
  consumeCostWarning(): CostWarning | null {
    const threshold = this.config.warnCostUsd
    if (threshold === undefined || this.warned) return null
    const costUsd = this.costUsd()
    if (costUsd < threshold) return null
    this.warned = true
    return { costUsd, thresholdUsd: threshold }
  }

  get currentSteps(): number {
    return this.steps
  }

  get currentUsage(): UsageTotals {
    return this.usage
  }
}
