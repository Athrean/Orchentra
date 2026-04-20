import { describe, expect, test } from 'bun:test'
import { computeBackoff, DEFAULT_RETRY_CONFIG } from '../src/retry'

describe('retry', () => {
  test('computes exponential backoff within bounds', () => {
    for (let i = 1; i <= 8; i++) {
      const delay = computeBackoff(i, DEFAULT_RETRY_CONFIG)
      const base = Math.min(DEFAULT_RETRY_CONFIG.initialMs * Math.pow(2, i - 1), DEFAULT_RETRY_CONFIG.maxMs)
      expect(delay).toBeGreaterThanOrEqual(base)
      expect(delay).toBeLessThanOrEqual(base * 2)
    }
  })

  test('caps at maxMs', () => {
    const delay = computeBackoff(20, DEFAULT_RETRY_CONFIG)
    expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxMs * 2)
  })

  test('attempt 1 starts at initialMs', () => {
    const config = { maxRetries: 3, initialMs: 100, maxMs: 10000 }
    const delay = computeBackoff(1, config)
    expect(delay).toBeGreaterThanOrEqual(100)
    expect(delay).toBeLessThanOrEqual(200)
  })
})
