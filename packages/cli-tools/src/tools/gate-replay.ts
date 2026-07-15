import type { CompletionReplayExecutor, ReplayTrialResult, RunState } from '@orchentra/cli-core'
import { runSubagentPool } from './subagent-pool'

export interface SubagentReplayOptions {
  /** Starts one isolated reviewer replay; inherited budget/depth are host-owned. */
  runTrial: (state: RunState, index: number) => Promise<ReplayTrialResult>
  limit?: number
}

/**
 * M4 adapter: CompletionPolicy asks core for a replay, this package fans it
 * out through the existing bounded sub-agent pool. Core stays dependency-free
 * while production hosts retain inherited budgets and depth caps.
 */
export class SubagentReplayExecutor implements CompletionReplayExecutor {
  private readonly limit: number

  constructor(private readonly options: SubagentReplayOptions) {
    this.limit = options.limit ?? 4
  }

  async replay(input: { readonly state: RunState; readonly k: number }): Promise<readonly ReplayTrialResult[]> {
    const tasks = Array.from({ length: input.k }, (_, index) => String(index + 1))
    const results = await runSubagentPool(tasks, {
      limit: Math.min(this.limit, input.k),
      run: async (task) => this.options.runTrial(input.state, Number(task)),
    })
    return results.map((result) => result.value)
  }
}
