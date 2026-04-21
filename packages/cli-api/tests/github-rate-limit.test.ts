import { describe, expect, test } from 'bun:test'
import {
  isPrimaryRateLimit,
  isSecondaryRateLimit,
  nextDelayMs,
  readRateLimit,
  retryAfterMs,
} from '../src/github/rate-limit'

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('readRateLimit', () => {
  test('parses all headers', () => {
    const h = headers({
      'x-ratelimit-remaining': '42',
      'x-ratelimit-limit': '5000',
      'x-ratelimit-reset': '1700000000',
    })
    expect(readRateLimit(h)).toEqual({
      remaining: 42,
      limit: 5000,
      resetAtMs: 1700000000000,
    })
  })

  test('returns nulls when headers absent', () => {
    expect(readRateLimit(headers({}))).toEqual({ remaining: null, limit: null, resetAtMs: null })
  })
})

describe('retryAfterMs', () => {
  test('parses numeric seconds', () => {
    expect(retryAfterMs(headers({ 'retry-after': '30' }))).toBe(30000)
  })

  test('parses HTTP date', () => {
    const future = new Date(Date.now() + 5000).toUTCString()
    const ms = retryAfterMs(headers({ 'retry-after': future }))
    expect(ms).toBeGreaterThan(3000)
    expect(ms).toBeLessThanOrEqual(5000)
  })

  test('null when absent', () => {
    expect(retryAfterMs(headers({}))).toBeNull()
  })
})

describe('rate-limit detection', () => {
  test('isPrimaryRateLimit: 403 with remaining=0', () => {
    expect(isPrimaryRateLimit(403, headers({ 'x-ratelimit-remaining': '0' }))).toBe(true)
  })

  test('isPrimaryRateLimit: 200 not rate limited', () => {
    expect(isPrimaryRateLimit(200, headers({ 'x-ratelimit-remaining': '0' }))).toBe(false)
  })

  test('isSecondaryRateLimit: body mentions secondary rate limit', () => {
    expect(isSecondaryRateLimit(403, 'You have exceeded a secondary rate limit')).toBe(true)
  })

  test('isSecondaryRateLimit: abuse detection', () => {
    expect(isSecondaryRateLimit(429, 'abuse detection triggered')).toBe(true)
  })
})

describe('nextDelayMs', () => {
  test('prefers retry-after header', () => {
    const delay = nextDelayMs(headers({ 'retry-after': '10' }), 'secondary rate limit', 403, 0)
    expect(delay).toBe(10000)
  })

  test('uses reset for primary rate limit', () => {
    const resetAt = Math.floor((Date.now() + 2000) / 1000)
    const delay = nextDelayMs(
      headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt) }),
      '',
      403,
      0,
    )
    expect(delay).toBeGreaterThan(500)
    expect(delay).toBeLessThanOrEqual(2000)
  })

  test('exponential backoff for secondary rate limit', () => {
    const delay = nextDelayMs(headers({}), 'secondary rate limit', 403, 2)
    expect(delay).toBe(4000)
  })

  test('returns null for non-rate-limit failures', () => {
    expect(nextDelayMs(headers({}), 'not found', 404, 0)).toBeNull()
  })
})
