// Scoreboard computation. Turns k trial outcomes into the per-eval and
// corpus-level metrics of docs/evals/01-EVAL-STRATEGY.md "How versions are
// compared": pass@1, pass^k, cost/success, loop rate, tool calls/success.
// Cost- and tool-per-success count every trial's spend (failed attempts
// included) against the successes — the honest efficiency read.

import type { EvalRun, EvalScore, Scoreboard, ScoreboardSummary } from './types'

export function scoreEval(run: EvalRun): EvalScore {
  const { meta, trials } = run
  const passCount = trials.filter((t) => t.passed).length
  const totalCostUsd = sum(trials.map((t) => t.metrics.estimatedCostUsd))
  const totalToolCalls = sum(trials.map((t) => t.metrics.toolCalls))
  const looped = trials.filter((t) => t.metrics.loopDetections > 0).length
  return {
    id: meta.id,
    category: meta.category,
    grader: meta.grader,
    split: meta.split ?? 'dev',
    trials: trials.length,
    passAt1: trials[0]?.passed ?? false,
    passHatK: trials.length > 0 && passCount === trials.length,
    passCount,
    totalCostUsd,
    costPerSuccessUsd: passCount > 0 ? totalCostUsd / passCount : null,
    loopRate: trials.length > 0 ? looped / trials.length : 0,
    toolCallsPerSuccess: passCount > 0 ? totalToolCalls / passCount : null,
  }
}

export function summarize(evals: EvalScore[]): ScoreboardSummary {
  const total = evals.length
  const passAt1 = evals.filter((e) => e.passAt1).length
  const passHatK = evals.filter((e) => e.passHatK).length
  const totalCost = sum(evals.map((e) => e.totalCostUsd))
  const totalSuccesses = sum(evals.map((e) => e.passCount))
  return {
    total,
    passAt1Rate: total > 0 ? passAt1 / total : 0,
    passHatKRate: total > 0 ? passHatK / total : 0,
    costPerSuccessUsd: totalSuccesses > 0 ? totalCost / totalSuccesses : null,
    loopRate: total > 0 ? mean(evals.map((e) => e.loopRate)) : 0,
  }
}

export interface ScoreboardContext {
  model: string
  /** Harness build label (version or binary path). */
  harness: string
  corpus: string
}

/** Score a set of runs into one scoreboard — the "one file per run" artifact. */
export function buildScoreboard(runs: EvalRun[], ctx: ScoreboardContext): Scoreboard {
  const evals = runs.map(scoreEval)
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    model: ctx.model,
    harness: ctx.harness,
    corpus: ctx.corpus,
    evals,
    summary: summarize(evals),
  }
}

// ── Version diff ────────────────────────────────────────────────────────────

export interface EvalDelta {
  id: string
  passHatKBefore: boolean
  passHatKAfter: boolean
  passAt1Before: boolean
  passAt1After: boolean
  costPerSuccessDeltaUsd: number | null
  /** passHatK regressed: passed in `before`, fails in `after`. */
  regressed: boolean
  /** passHatK newly passes in `after`. */
  fixed: boolean
}

export interface ScoreboardDiff {
  before: string
  after: string
  model: string
  passHatKRateDelta: number
  passAt1RateDelta: number
  regressions: string[]
  fixes: string[]
  evals: EvalDelta[]
}

/**
 * Diff two scoreboards produced from the same corpus/model/k with different
 * harness builds (01-EVAL-STRATEGY.md "How versions are compared"). Evals are
 * matched by id; ids present in only one side are ignored (corpora must match).
 */
export function diffScoreboards(before: Scoreboard, after: Scoreboard): ScoreboardDiff {
  const afterById = new Map(after.evals.map((e) => [e.id, e]))
  const evals: EvalDelta[] = []
  for (const b of before.evals) {
    const a = afterById.get(b.id)
    if (!a) continue
    evals.push({
      id: b.id,
      passHatKBefore: b.passHatK,
      passHatKAfter: a.passHatK,
      passAt1Before: b.passAt1,
      passAt1After: a.passAt1,
      costPerSuccessDeltaUsd: deltaOrNull(b.costPerSuccessUsd, a.costPerSuccessUsd),
      regressed: b.passHatK && !a.passHatK,
      fixed: !b.passHatK && a.passHatK,
    })
  }
  return {
    before: before.harness,
    after: after.harness,
    model: after.model,
    passHatKRateDelta: after.summary.passHatKRate - before.summary.passHatKRate,
    passAt1RateDelta: after.summary.passAt1Rate - before.summary.passAt1Rate,
    regressions: evals.filter((e) => e.regressed).map((e) => e.id),
    fixes: evals.filter((e) => e.fixed).map((e) => e.id),
    evals,
  }
}

function deltaOrNull(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null
  return after - before
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

function mean(xs: number[]): number {
  return xs.length > 0 ? sum(xs) / xs.length : 0
}
