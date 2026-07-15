// Regression suite runner (docs/evals/06-REGRESSION-SUITE.md). Every entry is a
// real failure that must never recur, so the suite is a gate rather than a
// measurement: it reports a status per entry and tells the caller whether the
// release is blocked.
//
// It differs from the corpus EvalRunner on purpose. A corpus eval asks a model
// to fix a seeded fixture, so every trial gets a throwaway copy; a regression
// entry asserts a property of the harness itself, so its grader runs in place
// against the repo, model-free and credential-free — which is what lets the
// whole suite run in CI with no API key. What both share is the binary grader:
// the exit code IS the grade ({@link runGrader}).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { failureSignature } from '../memory/failure-signature'
import { runGrader, type GradeResult } from './grader'
import type { EvalGrader } from './types'

export type RegressionCategory = 'harness' | 'browser'
export type RegressionStatus = 'passing' | 'failing' | 'quarantined'
/**
 * Where an entry's archived trace came from. `recorded` is the real
 * `.orchentra/traces/<run-id>/` of the run that failed; entries whose failure
 * predates the trace system archive an honest `synthetic-reconstruction`.
 */
export type RegressionTraceOrigin = 'recorded' | 'synthetic-reconstruction'

/** The doc's entry schema, minus the fields meta.json shares with an eval. */
export interface RegressionRecord {
  /** Classified: loop, false-done, context-rot, edit-failure, browser-crash, … */
  failureMode: string
  originalVersion: string
  fixedVersion: string
  /** PR that fixed it. */
  fixedBy: string
  expectedResult: string
  /** The entry's *recorded* status — what a run is compared against. */
  status: RegressionStatus
  traceOrigin: RegressionTraceOrigin
  /** Signature hash a quarantined entry was quarantined for (rule 2). */
  failureSignature?: string
}

/** Parsed `evals/regressions/<id>/meta.json`. */
export interface RegressionMeta {
  id: string
  category: RegressionCategory
  grader: EvalGrader
  k: number
  timeoutSec: number
  versionAdded: string
  regression: RegressionRecord
}

export interface RegressionEntry {
  dir: string
  meta: RegressionMeta
}

export interface RegressionTrial {
  trial: number
  passed: boolean
  exitCode: number
  timedOut: boolean
}

/** Failure signature of a run that did not fully pass; bounded for the report. */
export interface RegressionFailure {
  hash: string
  /** Secret-redacted, noise-normalized grader output (truncated). */
  normalizedLog: string
}

export interface RegressionOutcome {
  id: string
  category: RegressionCategory
  /** From meta.json — what the entry is recorded as. */
  recordedStatus: RegressionStatus
  /** What this run observed. */
  observedStatus: RegressionStatus
  trials: number
  passes: number
  /** Present whenever at least one trial failed. */
  failure: RegressionFailure | null
  /** A recorded-passing entry that failed every trial — the release blocker. */
  blocker: boolean
  /** Flaky now, or already recorded as quarantined: visible either way (rule 2). */
  quarantined: boolean
  trialResults: RegressionTrial[]
}

export interface RegressionReport {
  version: 1
  createdAt: string
  /** Suite directory the entries were read from. */
  suite: string
  /** Harness build label (version or binary path). */
  harness: string
  entries: RegressionOutcome[]
  /** Ids of recorded-passing entries that now fail outright. */
  blockers: string[]
  /** Ids that are quarantined — flaky now or recorded as such. */
  quarantined: string[]
  /** Any blocker ⇒ the release cannot ship (RELEASE-PROCESS.md step 8). */
  releaseBlocked: boolean
}

/** Max normalized-log characters kept per failure in a report. */
const SIGNATURE_LOG_LIMIT = 500

export function loadRegressionMeta(entryDir: string): RegressionMeta {
  return JSON.parse(readFileSync(join(entryDir, 'meta.json'), 'utf8')) as RegressionMeta
}

/** Absolute paths of every regression entry under `suiteDir`, sorted by id. */
export function discoverRegressionEntries(suiteDir: string): string[] {
  if (!existsSync(suiteDir)) return []
  return readdirSync(suiteDir)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(suiteDir, name))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, 'meta.json')))
    .sort()
}

export function loadRegressionEntries(suiteDir: string): RegressionEntry[] {
  return discoverRegressionEntries(suiteDir).map((dir) => ({ dir, meta: loadRegressionMeta(dir) }))
}

/**
 * The status k trials observed. All k pass ⇒ passing; none pass ⇒ failing;
 * anything between is flaky, which is quarantined, never rounded to either
 * (rule 2).
 */
export function observedStatus(passes: number, trials: number): RegressionStatus {
  if (trials > 0 && passes === trials) return 'passing'
  if (passes === 0) return 'failing'
  return 'quarantined'
}

/**
 * Only a *previously-passing* entry that now fails outright blocks the release
 * (01-EVAL-STRATEGY.md "How regressions block releases"). A flake does not:
 * quarantine makes it visible on every release checklist, whereas blocking CI on
 * it would just teach everyone to re-run the job. An entry already recorded
 * failing or quarantined is a known state, not a new regression.
 */
export function isBlocker(recorded: RegressionStatus, observed: RegressionStatus): boolean {
  return recorded === 'passing' && observed === 'failing'
}

export interface RunRegressionOptions {
  /** Trial-count override; otherwise the entry's meta.k. */
  k?: number
  /** Injected grader (tests); defaults to the real in-place subprocess grader. */
  grade?: (entry: RegressionEntry) => Promise<GradeResult>
}

function boundedFailure(id: string, output: string): RegressionFailure {
  const sig = failureSignature({ jobName: 'regressions', stepName: id, log: output })
  return { hash: sig.hash, normalizedLog: sig.normalizedLog.slice(0, SIGNATURE_LOG_LIMIT) }
}

/** Run one entry's k trials in place and classify the outcome. */
export async function runRegressionEntry(
  entry: RegressionEntry,
  opts: RunRegressionOptions = {},
): Promise<RegressionOutcome> {
  const { meta } = entry
  const k = opts.k !== undefined && opts.k > 0 ? opts.k : meta.k > 0 ? meta.k : 3
  const grade = opts.grade ?? ((e) => runGrader(e.dir, e.meta.grader, e.meta.timeoutSec, { capture: true }))

  const trialResults: RegressionTrial[] = []
  let failureOutput = ''
  for (let trial = 0; trial < k; trial++) {
    const g = await grade(entry)
    trialResults.push({ trial, passed: g.passed, exitCode: g.exitCode, timedOut: g.timedOut })
    if (!g.passed && !failureOutput) failureOutput = g.output
  }

  const passes = trialResults.filter((t) => t.passed).length
  const observed = observedStatus(passes, trialResults.length)
  return {
    id: meta.id,
    category: meta.category,
    recordedStatus: meta.regression.status,
    observedStatus: observed,
    trials: trialResults.length,
    passes,
    failure: passes < trialResults.length ? boundedFailure(meta.id, failureOutput) : null,
    blocker: isBlocker(meta.regression.status, observed),
    quarantined: observed === 'quarantined' || meta.regression.status === 'quarantined',
    trialResults,
  }
}

export async function runRegressionEntries(
  entries: RegressionEntry[],
  opts: RunRegressionOptions = {},
): Promise<RegressionOutcome[]> {
  const outcomes: RegressionOutcome[] = []
  for (const entry of entries) outcomes.push(await runRegressionEntry(entry, opts))
  return outcomes
}

export interface RegressionReportContext {
  suite: string
  harness: string
}

export function buildRegressionReport(outcomes: RegressionOutcome[], ctx: RegressionReportContext): RegressionReport {
  const blockers = outcomes.filter((o) => o.blocker).map((o) => o.id)
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    suite: ctx.suite,
    harness: ctx.harness,
    entries: outcomes,
    blockers,
    quarantined: outcomes.filter((o) => o.quarantined).map((o) => o.id),
    releaseBlocked: blockers.length > 0,
  }
}
