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
  private turnStartTokens = 0
  private warned = false
  private readonly limits: BudgetConfig

  constructor(config: BudgetConfig) {
    if (config.maxSteps <= 0) {
      throw new Error('budget.maxSteps must be positive')
    }
    if (config.maxTokens <= 0) {
      throw new Error('budget.maxTokens must be positive')
    }
    this.limits = { ...config }
  }

  /**
   * Start a new turn within the run. The per-turn runaway guards (steps,
   * tokens) reset; run-scoped spend — cumulative usage, dollar cost, and the
   * one-time cost warning — persists across turns and sub-agent calls.
   */
  beginTurn(): void {
    this.steps = 0
    this.turnStartTokens = totalTokens(this.usage)
  }

  /**
   * Apply mid-run limit changes (e.g. `/budget`). Only keys present in
   * `limits` are applied, so an explicit `undefined` clears a cap. Changing
   * the warn threshold re-arms the one-time cost warning.
   */
  updateLimits(limits: Partial<Pick<BudgetConfig, 'maxCostUsd' | 'warnCostUsd' | 'model'>>): void {
    if ('maxCostUsd' in limits) this.limits.maxCostUsd = limits.maxCostUsd
    if ('warnCostUsd' in limits) {
      if (limits.warnCostUsd !== this.limits.warnCostUsd) this.warned = false
      this.limits.warnCostUsd = limits.warnCostUsd
    }
    if ('model' in limits) this.limits.model = limits.model
  }

  tickStep(): void {
    this.steps += 1
  }

  addUsage(turn: UsageTotals): void {
    this.usage = addUsage(this.usage, turn)
  }

  private costUsd(): number {
    return estimatedCostUsd(this.usage, this.limits.model)
  }

  snapshot(): BudgetState {
    const costUsd = this.costUsd()
    const base = { steps: this.steps, usage: this.usage, costUsd }
    if (this.steps >= this.limits.maxSteps) {
      return { ...base, exhausted: true, exhaustedBy: 'steps' }
    }
    if (totalTokens(this.usage) - this.turnStartTokens >= this.limits.maxTokens) {
      return { ...base, exhausted: true, exhaustedBy: 'tokens' }
    }
    if (this.limits.maxCostUsd !== undefined && costUsd >= this.limits.maxCostUsd) {
      return { ...base, exhausted: true, exhaustedBy: 'cost' }
    }
    return { ...base, exhausted: false }
  }

  /**
   * Returns the cost warning the first time spend crosses `warnCostUsd`, then
   * `null` on every subsequent call. No-op when no warn threshold is set.
   */
  consumeCostWarning(): CostWarning | null {
    const threshold = this.limits.warnCostUsd
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
