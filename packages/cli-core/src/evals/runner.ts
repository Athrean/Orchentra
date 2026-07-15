// EvalRunner — orchestrates k trials of a harness against each eval and grades
// them. It reuses the runtime/trace substrate rather than reinventing task
// orchestration: a harness run produces a TraceManifest, {@link metricsFromManifest}
// projects the scoreboard's metrics off it, and the eval's binary grader decides
// pass/fail. Each trial runs in a throwaway copy of the eval dir (+ sibling lib/)
// so grade.sh/grade.mjs resolve their fixture and `../lib` exactly as in the
// corpus, and repeated trials never mutate the real corpus. Scoring the trials
// into a scoreboard is a separate concern ({@link ./scoreboard}).

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { TraceManifest } from '../runtime/trace'
import { loadEvalMeta, discoverEvals, effectiveK } from './corpus'
import { runGrader, type GradeResult } from './grader'
import type { EvalMeta, EvalRun, HarnessRunner, TrialMetrics, TrialResult } from './types'

export interface RunOptions {
  /** Drives the harness against one trial's fixture copy (real or scripted). */
  harness: HarnessRunner
  model: string
  /** Trial-count override; otherwise per-eval {@link effectiveK}. */
  k?: number
  /** Injected grader (tests); defaults to the real subprocess grader. */
  grade?: (evalDirCopy: string, meta: EvalMeta) => Promise<GradeResult>
}

/** Project the scoreboard's trial metrics off a run's trace manifest. */
export function metricsFromManifest(m: TraceManifest): TrialMetrics {
  return {
    billedTokens: m.billedTokens,
    cachedTokens: m.cachedTokens,
    estimatedCostUsd: m.estimatedCostUsd,
    loopDetections: m.loopDetections,
    toolCalls: m.eventCounts['tool_use'] ?? 0,
    steps: m.steps,
    doneReason: m.doneReason,
  }
}

/** Run one eval's k trials; returns the raw (unscored) run. */
export async function runEvalTrials(evalDir: string, opts: RunOptions): Promise<EvalRun> {
  const meta = loadEvalMeta(evalDir)
  const k = effectiveK(meta, opts.k)
  const grade = opts.grade ?? ((dir, m) => runGrader(dir, m.grader, m.timeoutSec))
  const libDir = join(dirname(evalDir), 'lib')
  const trials: TrialResult[] = []

  for (let trial = 0; trial < k; trial++) {
    const tmp = await mkdtemp(join(tmpdir(), 'orchentra-eval-'))
    try {
      const idCopy = join(tmp, meta.id)
      await cp(evalDir, idCopy, { recursive: true })
      await cp(libDir, join(tmp, 'lib'), { recursive: true })
      const taskPrompt = await readFile(join(idCopy, 'task.md'), 'utf8')
      const metrics = await opts.harness({
        evalId: meta.id,
        taskPrompt,
        workdir: join(idCopy, 'fixture'),
        model: opts.model,
        trial,
      })
      const g = await grade(idCopy, meta)
      trials.push({ trial, passed: g.passed, exitCode: g.exitCode, timedOut: g.timedOut, metrics })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  }
  return { meta, trials }
}

/** Run a set of eval dirs; returns raw runs in the given order. */
export async function runEvalDirs(evalDirs: string[], opts: RunOptions): Promise<EvalRun[]> {
  const runs: EvalRun[] = []
  for (const dir of evalDirs) runs.push(await runEvalTrials(dir, opts))
  return runs
}

/** Run the whole corpus (discovered under `corpusDir`). */
export function runCorpusTrials(corpusDir: string, opts: RunOptions): Promise<EvalRun[]> {
  return runEvalDirs(discoverEvals(corpusDir), opts)
}
