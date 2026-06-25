import { describe, expect, test } from 'bun:test'
import { RuntimeBudget } from '../src/runtime/budget'

describe('RuntimeBudget', () => {
  test('starts non-exhausted', () => {
    const b = new RuntimeBudget({ maxSteps: 5, maxTokens: 1000 })
    expect(b.snapshot().exhausted).toBe(false)
    expect(b.currentSteps).toBe(0)
  })

  test('exhausts on step limit', () => {
    const b = new RuntimeBudget({ maxSteps: 2, maxTokens: 10000 })
    b.tickStep()
    expect(b.snapshot().exhausted).toBe(false)
    b.tickStep()
    const snap = b.snapshot()
    expect(snap.exhausted).toBe(true)
    expect(snap.exhaustedBy).toBe('steps')
  })

  test('exhausts on token limit', () => {
    const b = new RuntimeBudget({ maxSteps: 100, maxTokens: 100 })
    b.addUsage({ inputTokens: 60, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 })
    const snap = b.snapshot()
    expect(snap.exhausted).toBe(true)
    expect(snap.exhaustedBy).toBe('tokens')
  })

  test('tracks cumulative usage', () => {
    const b = new RuntimeBudget({ maxSteps: 100, maxTokens: 10000 })
    b.addUsage({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 })
    b.addUsage({ inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 })
    expect(b.currentUsage).toEqual({
      inputTokens: 30,
      outputTokens: 15,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    })
  })

  test('rejects non-positive maxSteps', () => {
    expect(() => new RuntimeBudget({ maxSteps: 0, maxTokens: 100 })).toThrow('maxSteps')
  })

  test('rejects non-positive maxTokens', () => {
    expect(() => new RuntimeBudget({ maxSteps: 5, maxTokens: -1 })).toThrow('maxTokens')
  })

  test('exhausts on dollar cost limit', () => {
    const b = new RuntimeBudget({ maxSteps: 100, maxTokens: 1_000_000_000, maxCostUsd: 0.01, model: 'sonnet' })
    // 1000 output tokens at sonnet ($15/M) = $0.015 > $0.01
    b.addUsage({ inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 })
    const snap = b.snapshot()
    expect(snap.exhausted).toBe(true)
    expect(snap.exhaustedBy).toBe('cost')
    expect(snap.costUsd).toBeGreaterThanOrEqual(0.01)
  })

  test('never cost-exhausts when no maxCostUsd is set', () => {
    const b = new RuntimeBudget({ maxSteps: 100, maxTokens: 1_000_000_000, model: 'opus' })
    b.addUsage({ inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheCreationTokens: 0 })
    expect(b.snapshot().exhausted).toBe(false)
  })

  test('emits a cost warning once when crossing warnCostUsd', () => {
    const b = new RuntimeBudget({ maxSteps: 100, maxTokens: 1_000_000_000, warnCostUsd: 0.005, model: 'sonnet' })
    expect(b.consumeCostWarning()).toBeNull()
    b.addUsage({ inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 }) // $0.015
    const warning = b.consumeCostWarning()
    expect(warning).not.toBeNull()
    expect(warning?.thresholdUsd).toBe(0.005)
    expect(warning?.costUsd).toBeGreaterThanOrEqual(0.005)
    expect(b.consumeCostWarning()).toBeNull() // only once
  })
})
