import type { RuntimeEvent } from './events'
import type { ProgramSchedulerSnapshot } from './program-scheduler'

export interface OptimizationMetrics {
  schemaVersion: 1
  /** Child runtimes own separate observations; do not sum inclusive budgets here. */
  scope: 'root-provider-calls'
  stablePrefixHash: string
  cache: {
    inputTokens: number
    readTokens: number
    creationTokens: number
    unreportedInputTokens: number
    hitRate: number | null
  }
  invalidations: { forcedCompactions: number; thresholdCompactions: number; browserSnapshots: number }
  scheduler: ProgramSchedulerSnapshot | null
  speculation: { matched: number; discarded: number; failed: number; savedWaitMs: number; extraComputeMs: number }
}

/** Runtime-owned observations, independent of model-authored tool result data. */
export class OptimizationTracker {
  private inputTokens = 0
  private readTokens = 0
  private creationTokens = 0
  private unreportedInputTokens = 0
  private invalidations = { forcedCompactions: 0, thresholdCompactions: 0, browserSnapshots: 0 }
  private speculation = { matched: 0, discarded: 0, failed: 0, savedWaitMs: 0, extraComputeMs: 0 }

  constructor(private readonly stablePrefixHash: string) {}

  observe(event: RuntimeEvent): void {
    if (event.kind === 'usage') {
      const input = event.turn.inputTokens + event.turn.cacheReadTokens + event.turn.cacheCreationTokens
      this.inputTokens += input
      this.readTokens += event.turn.cacheReadTokens
      this.creationTokens += event.turn.cacheCreationTokens
      if (event.cacheReadReported !== true) this.unreportedInputTokens += input
    } else if (event.kind === 'context_invalidated') {
      if (event.reason === 'forced_compaction') this.invalidations.forcedCompactions++
      else if (event.reason === 'threshold_compaction') this.invalidations.thresholdCompactions++
      else this.invalidations.browserSnapshots += event.messagesAffected
    } else if (event.kind === 'speculative_tool') {
      this.speculation[event.attempt.status]++
      this.speculation.savedWaitMs += event.attempt.savedWaitMs
      this.speculation.extraComputeMs += event.attempt.extraComputeMs
    }
  }

  snapshot(scheduler: ProgramSchedulerSnapshot | null): OptimizationMetrics {
    return {
      schemaVersion: 1,
      scope: 'root-provider-calls',
      stablePrefixHash: this.stablePrefixHash,
      cache: {
        inputTokens: this.inputTokens,
        readTokens: this.readTokens,
        creationTokens: this.creationTokens,
        unreportedInputTokens: this.unreportedInputTokens,
        hitRate: this.inputTokens > 0 && this.unreportedInputTokens === 0 ? this.readTokens / this.inputTokens : null,
      },
      invalidations: { ...this.invalidations },
      scheduler,
      speculation: { ...this.speculation },
    }
  }
}
