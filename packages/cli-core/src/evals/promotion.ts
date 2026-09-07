import type { Scoreboard } from './types'

export interface PromotionEnvelope {
  maxCostUsdPerTrial: number
  maxLatencyMsPerTrial: number
  maxTokensPerTrial: number
}

export interface PromotionAssessment {
  eligible: boolean
  reasons: string[]
  /** This assessment does not change execution-profile defaults. */
  action: 'retain-experimental' | 'eligible-for-reviewed-promotion'
}

/** A missing measurement or a regression can never authorize promotion. */
export function assessExecutionPromotion(
  direct: Scoreboard,
  candidate: Scoreboard,
  evidence: {
    envelope?: PromotionEnvelope
    regressionStatus: 'passed' | 'failed' | 'unknown'
    /** Set only by a host that ran a real provider, never by scripted fixtures. */
    liveProvider: boolean
  },
): PromotionAssessment {
  const reasons: string[] = []
  if (!evidence.liveProvider) reasons.push('live_provider_evidence_missing')
  if (evidence.regressionStatus !== 'passed') reasons.push('regression_gate_not_passed')
  if (!evidence.envelope || Object.values(evidence.envelope).some((n) => !Number.isFinite(n) || n <= 0))
    reasons.push('valid_cost_latency_token_envelope_required')
  if (direct.executionProfile !== 'direct' || candidate.executionProfile === 'direct')
    reasons.push('invalid_control_or_candidate_profile')
  if (direct.model !== candidate.model || direct.corpus !== candidate.corpus) reasons.push('model_or_corpus_mismatch')
  const left = [...direct.evals].sort((a, b) => a.id.localeCompare(b.id))
  const right = [...candidate.evals].sort((a, b) => a.id.localeCompare(b.id))
  if (
    !left.length ||
    left.length !== right.length ||
    new Set(left.map((e) => e.id)).size !== left.length ||
    new Set(right.map((e) => e.id)).size !== right.length
  )
    reasons.push('incomplete_or_duplicate_eval_set')
  let wins = false
  for (let i = 0; i < left.length; i++) {
    const before = left[i]!
    const after = right[i]
    if (
      !after ||
      before.id !== after.id ||
      before.trials !== after.trials ||
      before.category !== after.category ||
      before.grader !== after.grader ||
      before.split !== after.split
    ) {
      reasons.push(`comparison_mismatch:${before.id}`)
      continue
    }
    if (after.passCount < before.passCount || (before.passHatK && !after.passHatK))
      reasons.push(`quality_regression:${before.id}`)
    const baseline = before.trialResults
    const trials = after.trialResults
    if (!baseline?.length || baseline.length !== before.trials || !trials?.length || trials.length !== after.trials) {
      reasons.push(`trial_measurements_missing:${before.id}`)
      continue
    }
    const measured = [...baseline, ...trials].every(
      (t) =>
        typeof t.metrics.latencyMs === 'number' &&
        Number.isFinite(t.metrics.latencyMs) &&
        t.metrics.latencyMs >= 0 &&
        typeof t.metrics.estimatedCostUsd === 'number' &&
        Number.isFinite(t.metrics.estimatedCostUsd) &&
        t.metrics.estimatedCostUsd >= 0,
    )
    if (!measured) reasons.push(`cost_or_latency_unknown:${before.id}`)
    for (const trial of trials) {
      const m = trial.metrics
      if (!trial.passed || trial.timedOut || trial.exitCode !== 0 || m.doneReason !== 'stop' || m.loopDetections > 0)
        reasons.push(`failed_trial:${before.id}:${trial.trial}`)
      if (!m.optimization || m.optimization.cache.hitRate === null)
        reasons.push(`cache_measurement_missing:${before.id}:${trial.trial}`)
      if (after.category === 'browser' && m.evidenceGatePassed !== true)
        reasons.push(`browser_evidence_missing:${before.id}:${trial.trial}`)
      const envelope = evidence.envelope
      if (
        envelope &&
        (m.estimatedCostUsd! > envelope.maxCostUsdPerTrial ||
          m.latencyMs! > envelope.maxLatencyMsPerTrial ||
          m.billedTokens + m.cachedTokens > envelope.maxTokensPerTrial)
      )
        reasons.push(`envelope_exceeded:${before.id}:${trial.trial}`)
    }
    if (measured) {
      const sum = (arm: typeof trials, field: 'latencyMs' | 'estimatedCostUsd'): number =>
        arm.reduce((n, t) => n + t.metrics[field]!, 0)
      wins ||=
        after.passCount > before.passCount ||
        sum(trials, 'latencyMs') < sum(baseline, 'latencyMs') ||
        sum(trials, 'estimatedCostUsd') < sum(baseline, 'estimatedCostUsd')
    }
  }
  if (!wins) reasons.push('no_measured_win')
  return {
    eligible: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    action: reasons.length === 0 ? 'eligible-for-reviewed-promotion' : 'retain-experimental',
  }
}
