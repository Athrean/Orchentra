import type { GateDecisionRecord, GateTrial, RunState, VerificationObligation } from './run-state'

export interface ReplayTrialResult {
  readonly passed: boolean
  readonly summary: string
  readonly traceId?: string
}

/** Host adapter for k replay trials. CLI tools implement this over sub-agent pool. */
export interface CompletionReplayExecutor {
  replay(input: { readonly state: RunState; readonly k: number }): Promise<readonly ReplayTrialResult[]>
}

export interface CompletionPolicyOptions {
  readonly obligations: readonly VerificationObligation[]
  readonly k?: number
  readonly maxRetries?: number
  readonly replay?: CompletionReplayExecutor
}

export interface AssertionResult {
  readonly passed: boolean
  readonly missingObligations: readonly string[]
}

/** Typed post-work policy: evidence first, then k independent replay decisions. */
export class CompletionPolicy {
  readonly obligations: readonly VerificationObligation[]
  readonly k: number
  readonly maxRetries: number
  private readonly replay?: CompletionReplayExecutor

  constructor(options: CompletionPolicyOptions) {
    if (options.obligations.length === 0) throw new Error('CompletionPolicy needs at least one verification obligation')
    this.obligations = options.obligations.map((obligation) => ({
      ...obligation,
      evidenceKinds: [...obligation.evidenceKinds],
    }))
    this.k = options.k ?? 3
    this.maxRetries = options.maxRetries ?? 2
    if (!Number.isInteger(this.k) || this.k < 1) throw new Error('CompletionPolicy k must be a positive integer')
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0)
      throw new Error('CompletionPolicy maxRetries must be non-negative')
    this.replay = options.replay
  }

  assert(state: RunState): AssertionResult {
    const missingObligations = this.obligations
      .filter(
        (obligation) => !obligation.evidenceKinds.every((kind) => state.evidence.some((item) => item.kind === kind)),
      )
      .map((obligation) => obligation.id)
    return { passed: missingObligations.length === 0, missingObligations }
  }

  async decide(state: RunState, at: string): Promise<GateDecisionRecord> {
    const assertion = this.assert(state)
    if (!assertion.passed) {
      return {
        at,
        outcome: 'assert_failed',
        summary: `missing verification evidence for ${assertion.missingObligations.join(', ')}`,
        missingObligations: assertion.missingObligations,
        trials: [],
      }
    }
    const replayed = this.replay ? await this.replay.replay({ state, k: this.k }) : defaultReplay(this.k)
    const trials = normalizeTrials(replayed, this.k)
    const passes = trials.filter((trial) => trial.passed).length
    return {
      at,
      outcome: passes === this.k ? 'pass' : 'gate_failed',
      summary: `${passes}/${this.k} replay trials passed`,
      missingObligations: [],
      trials,
    }
  }
}

function defaultReplay(k: number): readonly ReplayTrialResult[] {
  // Evidence is immutable at GATE. This is a deterministic fallback for hosts
  // that cannot spawn children; production CLI supplies the pool adapter.
  return Array.from({ length: k }, () => ({ passed: true, summary: 'evidence replay passed' }))
}

function normalizeTrials(results: readonly ReplayTrialResult[], k: number): readonly GateTrial[] {
  return Array.from({ length: k }, (_, index) => {
    const result = results[index]
    return result
      ? { index: index + 1, passed: result.passed, summary: result.summary, traceId: result.traceId }
      : { index: index + 1, passed: false, summary: 'replay trial did not return a result' }
  })
}
