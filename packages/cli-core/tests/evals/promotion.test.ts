import { describe, expect, test } from 'bun:test'
import { assessExecutionPromotion } from '../../src/evals/promotion'
import { buildScoreboard, parseScoreboard } from '../../src/evals/scoreboard'
import { OptimizationTracker } from '../../src/runtime/optimization'
import { emptyUsage } from '../../src/runtime/events'
import type { Scoreboard } from '../../src/evals/types'

function board(profile: 'direct' | 'rlm', latencyMs: number): Scoreboard {
  const tracker = new OptimizationTracker('prefix')
  tracker.observe({
    kind: 'usage',
    step: 1,
    turn: { ...emptyUsage(), inputTokens: 100 },
    cumulative: emptyUsage(),
    cacheReadReported: true,
  })
  return buildScoreboard(
    [
      {
        meta: {
          id: 'short',
          category: 'coding',
          type: 'fixture',
          grader: 'test',
          k: 1,
          timeoutSec: 60,
          versionAdded: 'test',
        },
        trials: [
          {
            trial: 0,
            passed: true,
            exitCode: 0,
            timedOut: false,
            metrics: {
              latencyMs,
              optimization: tracker.snapshot(null),
              billedTokens: 100,
              cachedTokens: 0,
              estimatedCostUsd: 0.01,
              loopDetections: 0,
              toolCalls: 1,
              steps: 1,
              doneReason: 'stop',
            },
          },
        ],
      },
    ],
    { model: 'same', harness: 'same', corpus: 'locked', executionProfile: profile },
  )
}
const evidence = {
  envelope: { maxCostUsdPerTrial: 1, maxLatencyMsPerTrial: 1000, maxTokensPerTrial: 1000 },
  regressionStatus: 'passed' as const,
  liveProvider: true,
}

describe('execution promotion gate', () => {
  test('requires comparable measurements, a win and verified regression evidence', () => {
    const before = board('direct', 100)
    const after = board('rlm', 50)
    expect(assessExecutionPromotion(before, after, evidence).eligible).toBe(true)
    for (const regressionStatus of ['failed', 'unknown'] as const) {
      expect(assessExecutionPromotion(before, after, { ...evidence, regressionStatus }).eligible).toBe(false)
    }
    expect(assessExecutionPromotion(before, after, { ...evidence, liveProvider: false }).eligible).toBe(false)
    expect(assessExecutionPromotion(before, after, { ...evidence, envelope: undefined }).eligible).toBe(false)
    expect(assessExecutionPromotion(before, board('rlm', 100), evidence).reasons).toContain('no_measured_win')
  })

  test('rejects regressions, missing cost/cache/evidence, limits and mismatched task sets', () => {
    const before = board('direct', 100)
    for (const mutate of [
      (b: Scoreboard) => {
        b.evals[0]!.trialResults![0]!.passed = false
      },
      (b: Scoreboard) => {
        b.evals[0]!.trialResults![0]!.metrics.estimatedCostUsd = undefined
      },
      (b: Scoreboard) => {
        b.evals[0]!.trialResults![0]!.metrics.optimization = null
      },
      (b: Scoreboard) => {
        b.evals[0]!.trialResults![0]!.metrics.latencyMs = 1001
      },
      (b: Scoreboard) => {
        b.evals[0]!.id = 'different'
      },
      (b: Scoreboard) => {
        b.model = 'different'
      },
    ]) {
      const after = board('rlm', 50)
      mutate(after)
      expect(assessExecutionPromotion(before, after, evidence).eligible).toBe(false)
    }
    const browserBefore = board('direct', 100)
    const browserAfter = board('rlm', 50)
    browserBefore.evals[0]!.category = browserAfter.evals[0]!.category = 'browser'
    expect(assessExecutionPromotion(browserBefore, browserAfter, evidence).reasons).toContain(
      'browser_evidence_missing:short:0',
    )
  })

  test('scoreboards retain raw optimization metrics and old versions migrate as unmeasured', () => {
    const current = board('rlm', 50)
    expect(current.version).toBe(3)
    expect(current.evals[0]!.trialResults![0]!.metrics.optimization!.cache.hitRate).toBe(0)
    const migrated = parseScoreboard({ ...current, version: 2 })
    expect(migrated.evals[0]!.trialResults).toBeNull()
    expect(() => parseScoreboard({ ...current, version: 4 })).toThrow('newer')
  })
})
