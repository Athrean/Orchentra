import { describe, expect, test } from 'bun:test'
import { buildScoreboard, diffScoreboards, type ScoreboardContext } from '../../src/evals/scoreboard'
import type { EvalMeta, EvalRun, Scoreboard, TrialMetrics, TrialResult } from '../../src/evals/types'

function meta(id: string): EvalMeta {
  return {
    id,
    category: 'coding',
    type: 'bugfix',
    grader: 'test',
    k: 1,
    timeoutSec: 60,
    versionAdded: '0.6.0',
    split: 'dev',
  }
}
function metrics(cost: number): TrialMetrics {
  return {
    billedTokens: 100,
    cachedTokens: 0,
    estimatedCostUsd: cost,
    loopDetections: 0,
    toolCalls: 2,
    steps: 1,
    doneReason: 'stop',
  }
}
function trial(passed: boolean, cost = 0.01): TrialResult {
  return { trial: 0, passed, exitCode: passed ? 0 : 1, timedOut: false, metrics: metrics(cost) }
}
function run(id: string, passed: boolean, cost = 0.01): EvalRun {
  return { meta: meta(id), trials: [trial(passed, cost)] }
}
function board(runs: EvalRun[], ctx: Partial<ScoreboardContext> = {}): Scoreboard {
  return buildScoreboard(runs, { model: 'm', harness: 'x', corpus: 'evals/', ...ctx })
}

describe('diffScoreboards', () => {
  test('classifies regressions and fixes by pass^k transition', () => {
    const before = board([run('a', true), run('b', false), run('c', true)], { harness: '0.6.0' })
    const after = board([run('a', false), run('b', true), run('c', true)], { harness: '0.7.0' })

    const d = diffScoreboards(before, after)
    expect(d.before).toBe('0.6.0')
    expect(d.after).toBe('0.7.0')
    expect(d.regressions).toEqual(['a'])
    expect(d.fixes).toEqual(['b'])
    expect(d.passHatKRateDelta).toBeCloseTo(0, 10) // 2/3 → 2/3
    expect(d.evals).toHaveLength(3)
    expect(d.evals.find((e) => e.id === 'a')?.regressed).toBe(true)
    expect(d.evals.find((e) => e.id === 'b')?.fixed).toBe(true)
    expect(d.evals.find((e) => e.id === 'c')?.regressed).toBe(false)
  })

  test('rate delta is signed; net improvement is positive', () => {
    const before = board([run('a', false), run('b', false)])
    const after = board([run('a', true), run('b', true)])
    expect(diffScoreboards(before, after).passHatKRateDelta).toBeCloseTo(1, 10)
  })

  test('cost-per-success delta is null when a side had zero successes', () => {
    const before = board([run('a', false, 0.02)]) // no success → costPerSuccess null
    const after = board([run('a', true, 0.03)])
    const delta = diffScoreboards(before, after).evals[0]?.costPerSuccessDeltaUsd
    expect(delta).toBeNull()
  })

  test('ids present in only one side are ignored (corpora must match)', () => {
    const before = board([run('a', true), run('only-before', true)])
    const after = board([run('a', true), run('only-after', true)])
    const d = diffScoreboards(before, after)
    expect(d.evals.map((e) => e.id)).toEqual(['a'])
  })
})
