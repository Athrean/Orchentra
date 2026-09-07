import { describe, expect, test } from 'bun:test'
import { OptimizationTracker } from '../src/runtime/optimization'
import { parseTraceManifest } from '../src/runtime/trace'
import { emptyUsage } from '../src/runtime/events'

describe('optimization evidence', () => {
  test('distinguishes missing cache observations from explicit zero and weighted cache hits', () => {
    const known = new OptimizationTracker('prefix')
    expect(known.snapshot(null).cache.hitRate).toBeNull()
    known.observe({
      kind: 'usage',
      step: 1,
      turn: { ...emptyUsage(), inputTokens: 100 },
      cumulative: emptyUsage(),
      cacheReadReported: true,
    })
    expect(known.snapshot(null).cache.hitRate).toBe(0)
    known.observe({
      kind: 'usage',
      step: 2,
      turn: { ...emptyUsage(), inputTokens: 20, cacheReadTokens: 80 },
      cumulative: emptyUsage(),
      cacheReadReported: true,
    })
    expect(known.snapshot(null).cache.hitRate).toBe(0.4)
    known.observe({ kind: 'usage', step: 3, turn: { ...emptyUsage(), inputTokens: 1 }, cumulative: emptyUsage() })
    expect(known.snapshot(null).cache.hitRate).toBeNull()
    expect(known.snapshot(null).cache.unreportedInputTokens).toBe(1)
  })

  test('migrates historical manifests without fabricating optimization observations', () => {
    const old = { traceId: 'old', usage: emptyUsage() }
    expect(parseTraceManifest(old)).toMatchObject({ schemaVersion: 2, optimization: null })
    expect(old).not.toHaveProperty('schemaVersion')
    expect(() => parseTraceManifest({ ...old, schemaVersion: 3 })).toThrow('newer')
  })
})
