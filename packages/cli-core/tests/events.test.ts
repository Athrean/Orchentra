import { describe, expect, test } from 'bun:test'
import { addUsage, emptyUsage, totalTokens } from '../src/runtime/events'

describe('emptyUsage', () => {
  test('returns all-zero totals', () => {
    const u = emptyUsage()
    expect(u.inputTokens).toBe(0)
    expect(u.outputTokens).toBe(0)
    expect(u.cacheReadTokens).toBe(0)
    expect(u.cacheCreationTokens).toBe(0)
  })
})

describe('addUsage', () => {
  test('sums all fields', () => {
    const a = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheCreationTokens: 1 }
    const b = { inputTokens: 3, outputTokens: 7, cacheReadTokens: 0, cacheCreationTokens: 4 }
    const result = addUsage(a, b)
    expect(result).toEqual({
      inputTokens: 13,
      outputTokens: 12,
      cacheReadTokens: 2,
      cacheCreationTokens: 5,
    })
  })
})

describe('totalTokens', () => {
  test('sums all four fields', () => {
    const u = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheCreationTokens: 15 }
    expect(totalTokens(u)).toBe(50)
  })
})
