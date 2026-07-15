import { describe, expect, test } from 'bun:test'
import { buildScoreboard, scoreEval, summarize } from '../../src/evals/scoreboard'
import type { EvalMeta, EvalRun, TrialMetrics, TrialResult } from '../../src/evals/types'

function meta(id: string, over: Partial<EvalMeta> = {}): EvalMeta {
  return {
    id,
    category: 'coding',
    type: 'bugfix',
    grader: 'test',
    k: 3,
    timeoutSec: 60,
    versionAdded: '0.6.0',
    split: 'dev',
    ...over,
  }
}

function m(over: Partial<TrialMetrics> = {}): TrialMetrics {
  return {
    billedTokens: 100,
    cachedTokens: 0,
    estimatedCostUsd: 0.01,
    loopDetections: 0,
    toolCalls: 4,
    steps: 2,
    doneReason: 'stop',
    ...over,
  }
}

function trial(n: number, passed: boolean, metrics = m()): TrialResult {
  return { trial: n, passed, exitCode: passed ? 0 : 1, timedOut: false, metrics }
}

function run(id: string, passes: boolean[], over: Partial<EvalMeta> = {}, metrics?: TrialMetrics[]): EvalRun {
  return { meta: meta(id, over), trials: passes.map((p, i) => trial(i, p, metrics?.[i])) }
}

describe('scoreEval', () => {
  test('all k pass: passAt1 + passHatK true; per-success cost/tools divide by successes', () => {
    const s = scoreEval(run('e', [true, true, true]))
    expect(s.passAt1).toBe(true)
    expect(s.passHatK).toBe(true)
    expect(s.passCount).toBe(3)
    expect(s.trials).toBe(3)
    expect(s.totalCostUsd).toBeCloseTo(0.03, 10)
    expect(s.costPerSuccessUsd).toBeCloseTo(0.01, 10)
    expect(s.toolCallsPerSuccess).toBeCloseTo(4, 10) // 12 tool calls / 3 successes
    expect(s.loopRate).toBe(0)
  })

  test('trial 1 fails but 2 and 3 pass: passAt1 false, passHatK false, cost spread over 2 successes', () => {
    const s = scoreEval(run('e', [false, true, true]))
    expect(s.passAt1).toBe(false)
    expect(s.passHatK).toBe(false)
    expect(s.passCount).toBe(2)
    // all 3 trials' spend counts against the 2 successes (failed attempts included)
    expect(s.costPerSuccessUsd).toBeCloseTo(0.03 / 2, 10)
    expect(s.toolCallsPerSuccess).toBeCloseTo(12 / 2, 10)
  })

  test('zero successes: per-success metrics are null, not zero or Infinity', () => {
    const s = scoreEval(run('e', [false, false, false]))
    expect(s.passCount).toBe(0)
    expect(s.costPerSuccessUsd).toBeNull()
    expect(s.toolCallsPerSuccess).toBeNull()
    expect(s.totalCostUsd).toBeCloseTo(0.03, 10)
  })

  test('loopRate is the fraction of trials that tripped the loop detector', () => {
    const s = scoreEval(run('e', [true, true, true], {}, [m(), m({ loopDetections: 1 }), m({ loopDetections: 3 })]))
    expect(s.loopRate).toBeCloseTo(2 / 3, 10)
  })

  test('carries category/grader/split through from meta', () => {
    const s = scoreEval(run('b', [true], { category: 'browser', grader: 'playwright', split: 'test' }))
    expect(s.category).toBe('browser')
    expect(s.grader).toBe('playwright')
    expect(s.split).toBe('test')
  })
})

describe('summarize', () => {
  test('rates and corpus cost/success aggregate across evals', () => {
    const s = summarize([
      scoreEval(run('a', [true, true, true])), // passAt1 + passHatK
      scoreEval(run('b', [true, false, true])), // passAt1 only
      scoreEval(run('c', [false, false, false])), // neither
    ])
    expect(s.total).toBe(3)
    expect(s.passAt1Rate).toBeCloseTo(2 / 3, 10)
    expect(s.passHatKRate).toBeCloseTo(1 / 3, 10)
    // total cost 9 trials * 0.01 = 0.09; successes = 3 + 2 + 0 = 5
    expect(s.costPerSuccessUsd).toBeCloseTo(0.09 / 5, 10)
  })

  test('empty corpus: rates 0, cost/success null', () => {
    const s = summarize([])
    expect(s.total).toBe(0)
    expect(s.passAt1Rate).toBe(0)
    expect(s.costPerSuccessUsd).toBeNull()
  })
})

describe('buildScoreboard', () => {
  test('assembles the one-file-per-run artifact with context + summary', () => {
    const board = buildScoreboard([run('a', [true, true, true]), run('b', [false, false, false])], {
      model: 'claude-x',
      harness: '0.6.0',
      corpus: 'evals/',
    })
    expect(board.version).toBe(1)
    expect(board.model).toBe('claude-x')
    expect(board.harness).toBe('0.6.0')
    expect(board.corpus).toBe('evals/')
    expect(board.evals).toHaveLength(2)
    expect(board.summary.total).toBe(2)
    expect(board.summary.passHatKRate).toBeCloseTo(0.5, 10)
    expect(typeof board.createdAt).toBe('string')
    // serializes cleanly to the scoreboard JSON emitted per run
    expect(() => JSON.parse(JSON.stringify(board))).not.toThrow()
  })
})
