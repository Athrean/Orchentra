import { type UsageTotals, addUsage, emptyUsage, totalTokens } from './events'

export interface BudgetConfig {
  maxSteps: number
  maxTokens: number
}

export interface BudgetState {
  steps: number
  usage: UsageTotals
  exhausted: boolean
  exhaustedBy?: 'steps' | 'tokens'
}

export class RuntimeBudget {
  private steps = 0
  private usage: UsageTotals = emptyUsage()

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

  snapshot(): BudgetState {
    const tokens = totalTokens(this.usage)
    if (this.steps >= this.config.maxSteps) {
      return {
        steps: this.steps,
        usage: this.usage,
        exhausted: true,
        exhaustedBy: 'steps',
      }
    }
    if (tokens >= this.config.maxTokens) {
      return {
        steps: this.steps,
        usage: this.usage,
        exhausted: true,
        exhaustedBy: 'tokens',
      }
    }
    return { steps: this.steps, usage: this.usage, exhausted: false }
  }

  get currentSteps(): number {
    return this.steps
  }

  get currentUsage(): UsageTotals {
    return this.usage
  }
}
