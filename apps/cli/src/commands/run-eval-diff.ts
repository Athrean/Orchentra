// `orchentra eval --against <bin>` — version-diff mode. Runs the same corpus,
// same model, same k against two harness builds (this one and `--against`) and
// emits the diffed scoreboards (docs/evals/01-EVAL-STRATEGY.md "How versions are
// compared"): per-eval pass^k transitions plus the regressions and fixes lists.
// Harnesses and grader are injectable seams so the pipeline is testable without
// a live model.

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  buildScoreboard,
  diffScoreboards,
  discoverEvals,
  runEvalDirs,
  PROFILE_MODE_ENV,
  assessExecutionPromotion,
  loadRegressionEntries,
  runRegressionEntries,
  type PromotionEnvelope,
  type ExecutionProfile,
  type EvalMeta,
  type GradeResult,
  type HarnessRunner,
} from '@orchentra/cli-core'
import { CLI_VERSION } from '../version'
import { subprocessHarness } from './run-eval'

export interface RunEvalDiffArgs {
  corpus?: string
  id?: string
  model: string
  k?: number
  out?: string
  /** Path/entry of the second harness build to compare against. */
  against: string
  executionProfile?: ExecutionProfile
  /** Injected harnesses (tests); default to real subprocess harnesses. */
  harnessBefore?: HarnessRunner
  harnessAfter?: HarnessRunner
  grade?: (evalDirCopy: string, meta: EvalMeta) => Promise<GradeResult>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

export async function runEvalDiffCommand(args: RunEvalDiffArgs): Promise<number> {
  const write = args.stdout ?? ((t: string) => process.stdout.write(t))
  const warn = args.stderr ?? ((t: string) => process.stderr.write(t))

  const corpusDir = resolve(args.corpus ?? 'evals')
  if (!existsSync(corpusDir)) {
    warn(`eval: corpus not found: ${corpusDir}\n`)
    return 1
  }
  if (args.id && !existsSync(join(corpusDir, args.id, 'meta.json'))) {
    warn(`eval: no eval '${args.id}' under ${corpusDir}\n`)
    return 1
  }
  const evalDirs = args.id ? [join(corpusDir, args.id)] : discoverEvals(corpusDir)
  if (evalDirs.length === 0) {
    warn(`eval: no evals found under ${corpusDir}\n`)
    return 1
  }

  const executionProfile = args.executionProfile ?? 'direct'
  const before = args.harnessBefore ?? subprocessHarness()
  const after = args.harnessAfter ?? subprocessHarness(args.against)

  const shared = { model: args.model, executionProfile, k: args.k, grade: args.grade }
  const runsBefore = await runEvalDirs(evalDirs, { harness: before, ...shared })
  const boardBefore = buildScoreboard(runsBefore, {
    model: args.model,
    harness: CLI_VERSION,
    corpus: corpusDir,
    executionProfile,
  })

  const runsAfter = await runEvalDirs(evalDirs, { harness: after, ...shared })
  const boardAfter = buildScoreboard(runsAfter, {
    model: args.model,
    harness: args.against,
    corpus: corpusDir,
    executionProfile,
  })

  const diff = diffScoreboards(boardBefore, boardAfter)
  return emitDiff(diff, args.out, write, warn)
}

export interface RunEvalAbArgs {
  corpus?: string
  id?: string
  model: string
  k?: number
  out?: string
  executionProfile?: ExecutionProfile
  /** Injected harnesses (tests); default to same-binary subprocess harnesses. */
  harnessGeneric?: HarnessRunner
  harnessProfiled?: HarnessRunner
  grade?: (evalDirCopy: string, meta: EvalMeta) => Promise<GradeResult>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

/**
 * `orchentra eval --ab-profiles` — the M5 A/B harness. Same corpus, same
 * model, same k, same binary; the only variable is the ModelProfile mode
 * (generic vs profiled, toggled via PROFILE_MODE_ENV in the child). The diffed
 * scoreboard is the justification artifact a profile divergence must cite.
 */
export async function runEvalProfilesAbCommand(args: RunEvalAbArgs): Promise<number> {
  const write = args.stdout ?? ((t: string) => process.stdout.write(t))
  const warn = args.stderr ?? ((t: string) => process.stderr.write(t))

  const corpusDir = resolve(args.corpus ?? 'evals')
  if (!existsSync(corpusDir)) {
    warn(`eval: corpus not found: ${corpusDir}\n`)
    return 1
  }
  if (args.id && !existsSync(join(corpusDir, args.id, 'meta.json'))) {
    warn(`eval: no eval '${args.id}' under ${corpusDir}\n`)
    return 1
  }
  const evalDirs = args.id ? [join(corpusDir, args.id)] : discoverEvals(corpusDir)
  if (evalDirs.length === 0) {
    warn(`eval: no evals found under ${corpusDir}\n`)
    return 1
  }

  const generic = args.harnessGeneric ?? subprocessHarness(undefined, { [PROFILE_MODE_ENV]: 'generic' })
  const profiled = args.harnessProfiled ?? subprocessHarness()

  const executionProfile = args.executionProfile ?? 'direct'
  const shared = { model: args.model, executionProfile, k: args.k, grade: args.grade }
  const runsGeneric = await runEvalDirs(evalDirs, { harness: generic, ...shared })
  const boardGeneric = buildScoreboard(runsGeneric, {
    model: args.model,
    harness: `${CLI_VERSION}#generic`,
    corpus: corpusDir,
    executionProfile,
  })

  const runsProfiled = await runEvalDirs(evalDirs, { harness: profiled, ...shared })
  const boardProfiled = buildScoreboard(runsProfiled, {
    model: args.model,
    harness: `${CLI_VERSION}#profiled`,
    corpus: corpusDir,
    executionProfile,
  })

  const diff = diffScoreboards(boardGeneric, boardProfiled)
  return emitDiff(diff, args.out, write, warn)
}

export interface RunEvalExecutionProfilesAbArgs {
  promotionEnvelope?: PromotionEnvelope
  corpus?: string
  id?: string
  model: string
  k?: number
  out?: string
  /** Injected harnesses keep the comparison deterministic in tests. */
  harnessDirect?: HarnessRunner
  harnessRlm?: HarnessRunner
  grade?: (evalDirCopy: string, meta: EvalMeta) => Promise<GradeResult>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

/** Same binary/model/corpus comparison; only the execution profile changes. */
export async function runEvalExecutionProfilesAbCommand(args: RunEvalExecutionProfilesAbArgs): Promise<number> {
  const write = args.stdout ?? ((t: string) => process.stdout.write(t))
  const warn = args.stderr ?? ((t: string) => process.stderr.write(t))
  const corpusDir = resolve(args.corpus ?? 'evals')
  if (!existsSync(corpusDir)) {
    warn(`eval: corpus not found: ${corpusDir}\n`)
    return 1
  }
  if (args.id && !existsSync(join(corpusDir, args.id, 'meta.json'))) {
    warn(`eval: no eval '${args.id}' under ${corpusDir}\n`)
    return 1
  }
  const evalDirs = args.id ? [join(corpusDir, args.id)] : discoverEvals(corpusDir)
  if (evalDirs.length === 0) {
    warn(`eval: no evals found under ${corpusDir}\n`)
    return 1
  }

  const directHarness = args.harnessDirect ?? subprocessHarness()
  const rlmHarness = args.harnessRlm ?? subprocessHarness()
  const shared = { model: args.model, k: args.k, grade: args.grade }
  const directRuns = await runEvalDirs(evalDirs, { harness: directHarness, executionProfile: 'direct', ...shared })
  const direct = buildScoreboard(directRuns, {
    model: args.model,
    harness: `${CLI_VERSION}#direct`,
    corpus: corpusDir,
    executionProfile: 'direct',
  })
  const rlmRuns = await runEvalDirs(evalDirs, { harness: rlmHarness, executionProfile: 'rlm', ...shared })
  const rlm = buildScoreboard(rlmRuns, {
    model: args.model,
    harness: `${CLI_VERSION}#rlm`,
    corpus: corpusDir,
    executionProfile: 'rlm',
  })
  const suite = join(corpusDir, 'regressions')
  let regressionStatus: 'passed' | 'failed' | 'unknown' = 'unknown'
  if (existsSync(suite)) {
    const outcomes = await runRegressionEntries(loadRegressionEntries(suite))
    if (outcomes.length > 0)
      regressionStatus = outcomes.every((entry) => entry.passes === entry.trials && entry.trials > 0)
        ? 'passed'
        : 'failed'
  }
  return emitDiff(
    {
      ...diffScoreboards(direct, rlm),
      measurements: { direct, rlm },
      promotion: assessExecutionPromotion(direct, rlm, {
        envelope: args.promotionEnvelope,
        regressionStatus,
        liveProvider: args.harnessDirect === undefined && args.harnessRlm === undefined,
      }),
    },
    args.out,
    write,
    warn,
  )
}

async function emitDiff(
  diff: unknown,
  out: string | undefined,
  write: (text: string) => void,
  warn: (text: string) => void,
): Promise<number> {
  const json = `${JSON.stringify(diff, null, 2)}\n`
  if (out) {
    const outPath = resolve(out)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, json, 'utf8')
    warn(`eval: scoreboard diff written to ${outPath}\n`)
  } else {
    write(json)
  }
  return 0
}
