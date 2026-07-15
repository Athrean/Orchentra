// Eval runner types. An eval is a directory `evals/<id>/{task.md, fixture/,
// grade.*, meta.json}` (docs/evals/01-EVAL-STRATEGY.md). The runner orchestrates
// k trials of a harness against each eval's fixture, grades each trial with the
// eval's binary grader, and aggregates the outcome into a scoreboard. Metrics are
// read straight off the run's trace manifest — never re-derived.

import type { DoneReason } from '../runtime/events'

export type EvalCategory = 'coding' | 'browser'
export type EvalGrader = 'test' | 'playwright' | 'diff'
export type EvalSplit = 'dev' | 'test'

/** Parsed `meta.json`. `reliability` (optional) bumps the default trial count to 5. */
export interface EvalMeta {
  id: string
  category: EvalCategory
  type: string
  grader: EvalGrader
  k: number
  timeoutSec: number
  versionAdded: string
  split?: EvalSplit
  reliability?: boolean
}

/**
 * The subset of {@link TraceManifest} the scoreboard consumes for one trial.
 * The real harness reads these off the manifest ({@link metricsFromManifest});
 * deterministic test harnesses build them from a scenario run. Nothing here is
 * re-derived from raw events by the scoreboard.
 */
export interface TrialMetrics {
  billedTokens: number
  cachedTokens: number
  estimatedCostUsd: number
  loopDetections: number
  toolCalls: number
  steps: number
  doneReason: DoneReason
}

export interface HarnessTrialInput {
  evalId: string
  /** The task prompt (contents of task.md). */
  taskPrompt: string
  /** A fresh working copy of the eval's `fixture/` the harness may mutate. */
  workdir: string
  model: string
  /** 0-based trial index. */
  trial: number
}

/**
 * Runs one trial: drive the harness against the task so it mutates `workdir`
 * toward solving it, and return the trial's metrics. The grader — not the
 * runner — decides pass/fail afterward by inspecting the mutated fixture.
 */
export type HarnessRunner = (input: HarnessTrialInput) => Promise<TrialMetrics>

export interface TrialResult {
  trial: number
  passed: boolean
  exitCode: number
  timedOut: boolean
  metrics: TrialMetrics
}

/** Raw outcome of running one eval's k trials — the runner's output, unscored. */
export interface EvalRun {
  meta: EvalMeta
  trials: TrialResult[]
}

/** Per-eval scoreboard entry aggregated across k trials. */
export interface EvalScore {
  id: string
  category: EvalCategory
  grader: EvalGrader
  split: EvalSplit
  /** Trials actually run. */
  trials: number
  /** Trial 1 passed. */
  passAt1: boolean
  /** All k trials passed. */
  passHatK: boolean
  passCount: number
  totalCostUsd: number
  /** Total spend across all trials per successful trial; null when 0 successes. */
  costPerSuccessUsd: number | null
  /** Fraction of trials that tripped the loop detector. */
  loopRate: number
  /** Total tool calls across all trials per successful trial; null when 0 successes. */
  toolCallsPerSuccess: number | null
}

export interface ScoreboardSummary {
  total: number
  passAt1Rate: number
  passHatKRate: number
  costPerSuccessUsd: number | null
  loopRate: number
}

/** One scoreboard per run (docs/evals/01-EVAL-STRATEGY.md "How versions are compared"). */
export interface Scoreboard {
  version: 1
  createdAt: string
  model: string
  /** Harness build label (e.g. version or binary path). */
  harness: string
  corpus: string
  evals: EvalScore[]
  summary: ScoreboardSummary
}
