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
})
