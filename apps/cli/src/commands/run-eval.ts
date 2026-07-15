// `orchentra eval` — run the eval corpus (or one eval) against this harness
// build + model and emit a scoreboard JSON (v0.6.0 exit criterion: one command →
// scoreboard). The runner/scoreboard live in cli-core; this command wires the
// *real* harness (spawn this CLI headless in each trial's fixture copy, read the
// run's trace manifest) and handles I/O. The harness and grader are injectable
// seams so the pipeline is testable without a live model or a browser engine.

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  buildScoreboard,
  discoverEvals,
  metricsFromManifest,
  runEvalDirs,
  type EvalMeta,
  type GradeResult,
  type HarnessRunner,
  type TraceManifest,
  type TrialMetrics,
} from '@orchentra/cli-core'
import { CLI_VERSION } from '../version'

export interface RunEvalArgs {
  corpus?: string
  id?: string
  model: string
  k?: number
  out?: string
  /** Injected harness (tests); defaults to the real subprocess harness. */
  harness?: HarnessRunner
  /** Injected grader (tests); defaults to cli-core's real subprocess grader. */
  grade?: (evalDirCopy: string, meta: EvalMeta) => Promise<GradeResult>
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

export async function runEvalCommand(args: RunEvalArgs): Promise<number> {
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

  const harness = args.harness ?? subprocessHarness()
  const runs = await runEvalDirs(evalDirs, { harness, model: args.model, k: args.k, grade: args.grade })
  const board = buildScoreboard(runs, { model: args.model, harness: CLI_VERSION, corpus: corpusDir })
  const json = `${JSON.stringify(board, null, 2)}\n`

  if (args.out) {
    const outPath = resolve(args.out)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, json, 'utf8')
    warn(`eval: scoreboard written to ${outPath}\n`)
  } else {
    write(json)
  }
  return 0
}

/**
 * The real harness: run this CLI headless (`-p`) inside the trial's fixture copy
 * so it edits files in place, then read the run's trace manifest for metrics.
 * Needs a configured model+credentials; without them the subprocess errors, no
 * manifest is written, and the trial scores as an errored run — honest, never
 * fabricated. Point the binary elsewhere for version-diff runs.
 */
export function subprocessHarness(binEntry = process.argv[1] ?? ''): HarnessRunner {
  return ({ taskPrompt, workdir, model }) =>
    new Promise<TrialMetrics>((resolvePromise) => {
      const child = spawn(
        process.execPath,
        [binEntry, '-p', taskPrompt, '-m', model, '--permission-mode', 'workspace-write'],
        { cwd: workdir, stdio: 'ignore' },
      )
      child.on('close', () => resolvePromise(readTrialMetrics(workdir)))
      child.on('error', () => resolvePromise(erroredMetrics()))
    })
}

/** Read the newest trace manifest written under `workdir/.orchentra/traces`. */
function readTrialMetrics(workdir: string): TrialMetrics {
  const tracesDir = join(workdir, '.orchentra', 'traces')
  let newest: { path: string; mtimeMs: number } | null = null
  try {
    for (const id of readdirSync(tracesDir)) {
      const manifestPath = join(tracesDir, id, 'manifest.json')
      try {
        const st = statSync(manifestPath)
        if (!newest || st.mtimeMs > newest.mtimeMs) newest = { path: manifestPath, mtimeMs: st.mtimeMs }
      } catch {
        // no manifest for this run id yet
      }
    }
  } catch {
    return erroredMetrics()
  }
  if (!newest) return erroredMetrics()
  try {
    return metricsFromManifest(JSON.parse(readFileSync(newest.path, 'utf8')) as TraceManifest)
  } catch {
    return erroredMetrics()
  }
}

function erroredMetrics(): TrialMetrics {
  return {
    billedTokens: 0,
    cachedTokens: 0,
    estimatedCostUsd: 0,
    loopDetections: 0,
    toolCalls: 0,
    steps: 0,
    doneReason: 'error',
  }
}
