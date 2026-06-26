import { parallelWaves, type Slice } from './slices'

/** Implement one slice (production: a TDD runtime turn; tests: a fake). */
export type RunSlice = (slice: Slice) => Promise<{ text: string; tokensIn: number; tokensOut: number }>

/**
 * The trusted gate: run the project's own checks for a slice and report
 * pass/fail (production reuses review.ts's CheckRunner; tests inject a fake).
 * A slice counts as built only if this passes — the same verify-by-running
 * trust the reviewer uses.
 */
export type RunCheck = (slice: Slice) => Promise<{ passed: boolean; output: string }>

export type SliceStatus = 'completed' | 'failed' | 'skipped'

export interface SliceResult {
  slice: Slice
  status: SliceStatus
  output: string
  tokensIn: number
  tokensOut: number
}

export interface BuildResult {
  completed: SliceResult[]
  failed: SliceResult[]
  skipped: SliceResult[]
  tokensIn: number
  tokensOut: number
}

export interface BuildOptions {
  slices: Slice[]
  runSlice: RunSlice
  runCheck: RunCheck
  /** Token budget: stop launching waves once total usage reaches this. */
  budget?: { maxTokens: number }
  /** Single runtime turn is serial; parallel subagents can flip this back on later. */
  parallel?: boolean
}

export async function build(opts: BuildOptions): Promise<BuildResult> {
  const result: BuildResult = { completed: [], failed: [], skipped: [], tokensIn: 0, tokensOut: 0 }
  let stopped = false

  for (const wave of parallelWaves(opts.slices)) {
    if (stopped) {
      for (const s of wave) result.skipped.push(skip(s))
      continue
    }

    const runOne = async (
      slice: Slice,
    ): Promise<{
      slice: Slice
      run: Awaited<ReturnType<RunSlice>>
      check: Awaited<ReturnType<RunCheck>>
    }> => {
      const run = await opts.runSlice(slice)
      const check = await opts.runCheck(slice)
      return { slice, run, check }
    }

    // Slices in a wave are file-disjoint by construction → safe to run together
    // unless the caller provides one shared runtime turn hook.
    const runs =
      opts.parallel === false ? await serial(wave, runOne) : await Promise.all(wave.map((slice) => runOne(slice)))

    for (const { slice, run, check } of runs) {
      result.tokensIn += run.tokensIn
      result.tokensOut += run.tokensOut
      const r: SliceResult = {
        slice,
        status: check.passed ? 'completed' : 'failed',
        output: check.passed ? run.text : check.output,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
      }
      ;(check.passed ? result.completed : result.failed).push(r)
    }

    if (opts.budget && result.tokensIn + result.tokensOut >= opts.budget.maxTokens) stopped = true
  }

  return result
}

async function serial<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (const item of items) out.push(await fn(item))
  return out
}

function skip(slice: Slice): SliceResult {
  return { slice, status: 'skipped', output: '', tokensIn: 0, tokensOut: 0 }
}
