import { describe, expect, test } from 'bun:test'
import { capturePrefixShape, comparePrefixShape, OptimizationTracker } from '../src/runtime/optimization'
import { parseTraceManifest } from '../src/runtime/trace'
import { emptyUsage } from '../src/runtime/events'
import type { ProviderToolSchema } from '../src/runtime/provider'

const readTool: ProviderToolSchema = { name: 'read_file', description: 'read', inputSchema: { path: 'string' } }
const grepTool: ProviderToolSchema = { name: 'grep_search', description: 'grep', inputSchema: { q: 'string' } }

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

  test('attributes a broken cache prefix to system, tool set, or tool order', () => {
    const base = capturePrefixShape('SYSTEM', [readTool, grepTool])

    expect(comparePrefixShape(base, capturePrefixShape('SYSTEM', [readTool, grepTool]))).toEqual([])
    expect(comparePrefixShape(base, capturePrefixShape('SYSTEM v2', [readTool, grepTool]))).toEqual(['system'])
    expect(
      comparePrefixShape(base, capturePrefixShape('SYSTEM', [{ ...readTool, description: 'read a file' }, grepTool])),
    ).toEqual(['tools'])
    // Same tools, different wire order. The prefix is matched as an ordered
    // byte sequence, so this breaks the cache without any tool having changed.
    expect(comparePrefixShape(base, capturePrefixShape('SYSTEM', [grepTool, readTool]))).toEqual(['tool_order'])
    // Dynamic system text sits after the boundary and must not register.
    expect(base.systemChars).toBe('SYSTEM'.length)
    expect(base.toolSchemaChars).toBeGreaterThan(0)
  })

  test('separates a measured-stable prefix from an unmeasured one', () => {
    const untouched = new OptimizationTracker('prefix').snapshot(null).prefix
    expect(untouched).toMatchObject({ calls: 0, changes: [] })

    const tracker = new OptimizationTracker('prefix')
    tracker.observePrefix(1, capturePrefixShape('SYSTEM', [readTool, grepTool]))
    // The first call establishes the baseline; it cannot itself be a change.
    expect(tracker.snapshot(null).prefix).toMatchObject({ calls: 1, changes: [] })

    tracker.observePrefix(2, capturePrefixShape('SYSTEM', [readTool, grepTool]))
    expect(tracker.snapshot(null).prefix.changes).toEqual([])

    tracker.observePrefix(3, capturePrefixShape('SYSTEM v2', [grepTool, readTool]))
    expect(tracker.snapshot(null).prefix).toMatchObject({
      calls: 3,
      changes: [{ step: 3, reasons: ['system', 'tool_order'] }],
    })
  })

  test('migrates historical manifests without fabricating optimization observations', () => {
    const old = { traceId: 'old', usage: emptyUsage() }
    expect(parseTraceManifest(old)).toMatchObject({ schemaVersion: 2, optimization: null })
    expect(old).not.toHaveProperty('schemaVersion')
    expect(() => parseTraceManifest({ ...old, schemaVersion: 3 })).toThrow('newer')
  })
})
