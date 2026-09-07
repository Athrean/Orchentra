import { describe, expect, test } from 'bun:test'
import { computeBackoff, DEFAULT_RETRY_CONFIG, fetchWithRetry, parseRetryAfter, resolveRetryConfig } from '../src/retry'
import { isRetryableStatus } from '../src/errors'

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

describe('fetchWithRetry', () => {
  const fast = { maxRetries: 3, initialMs: 1, maxMs: 10 }
  const noSleep = async (): Promise<void> => {}

  test('retries a 429 and returns the eventual success', async () => {
    // A single 429 used to end the run: the openai-compat and responses clients
    // classified retryable statuses and then never acted on the classification.
    let calls = 0
    const response = await fetchWithRetry(
      async () => {
        calls++
        return calls < 3 ? new Response('slow down', { status: 429 }) : new Response('ok', { status: 200 })
      },
      isRetryableStatus,
      { config: fast, sleep: noSleep },
    )
    expect(calls).toBe(3)
    expect(response.status).toBe(200)
  })

  test('returns a non-retryable status immediately', async () => {
    let calls = 0
    const response = await fetchWithRetry(
      async () => {
        calls++
        return new Response('bad key', { status: 401 })
      },
      isRetryableStatus,
      { config: fast, sleep: noSleep },
    )
    expect(calls).toBe(1)
    expect(response.status).toBe(401)
  })

  test('returns the last retryable response once attempts are exhausted', async () => {
    let calls = 0
    const response = await fetchWithRetry(
      async () => {
        calls++
        return new Response('still limited', { status: 429 })
      },
      isRetryableStatus,
      { config: fast, sleep: noSleep },
    )
    expect(calls).toBe(fast.maxRetries + 1)
    expect(response.status).toBe(429)
  })

  test('honours Retry-After over the computed backoff', async () => {
    const waits: number[] = []
    let calls = 0
    await fetchWithRetry(
      async () => {
        calls++
        return calls === 1
          ? new Response('wait', { status: 429, headers: { 'retry-after': '2' } })
          : new Response('ok', { status: 200 })
      },
      isRetryableStatus,
      {
        config: { maxRetries: 3, initialMs: 1000, maxMs: 30_000 },
        sleep: async (ms) => {
          waits.push(ms)
        },
      },
    )
    expect(waits).toEqual([2000])
  })

  test('clamps a Retry-After that exceeds the configured ceiling', async () => {
    const waits: number[] = []
    let calls = 0
    await fetchWithRetry(
      async () => {
        calls++
        return calls === 1
          ? new Response('wait', { status: 503, headers: { 'retry-after': '86400' } })
          : new Response('ok', { status: 200 })
      },
      isRetryableStatus,
      { config: fast, sleep: async (ms: number): Promise<void> => void waits.push(ms) },
    )
    expect(waits).toEqual([fast.maxMs])
  })

  test('retries a network error and rethrows it when attempts run out', async () => {
    let calls = 0
    await expect(
      fetchWithRetry(
        async () => {
          calls++
          throw new Error('ECONNRESET')
        },
        isRetryableStatus,
        { config: fast, sleep: noSleep },
      ),
    ).rejects.toThrow('ECONNRESET')
    expect(calls).toBe(fast.maxRetries + 1)
  })

  test('never retries around an abort', async () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    await expect(
      fetchWithRetry(
        async () => {
          calls++
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        },
        isRetryableStatus,
        { config: fast, sleep: noSleep, signal: controller.signal },
      ),
    ).rejects.toThrow('aborted')
    expect(calls).toBe(1)
  })

  test('parseRetryAfter accepts seconds and HTTP dates, rejects junk', () => {
    const now = Date.parse('2026-09-07T00:00:00Z')
    expect(parseRetryAfter('30', now, 60_000)).toBe(30_000)
    expect(parseRetryAfter('0', now, 60_000)).toBe(0)
    expect(parseRetryAfter('Mon, 07 Sep 2026 00:00:10 GMT', now, 60_000)).toBe(10_000)
    expect(parseRetryAfter('later please', now, 60_000)).toBeNull()
    expect(parseRetryAfter(null, now, 60_000)).toBeNull()
  })
})

describe('resolveRetryConfig', () => {
  test('defaults when nothing overrides it', () => {
    expect(resolveRetryConfig(undefined, {})).toEqual(DEFAULT_RETRY_CONFIG)
  })

  test('reads the retry budget from the environment', () => {
    // The eval harness drives the CLI as a subprocess, so env is what lets a
    // whole sweep run on a short budget without threading config through it.
    expect(
      resolveRetryConfig(undefined, {
        ORCHENTRA_RETRY_MAX_ATTEMPTS: '4',
        ORCHENTRA_RETRY_INITIAL_MS: '250',
        ORCHENTRA_RETRY_MAX_MS: '16000',
      }),
    ).toEqual({ maxRetries: 4, initialMs: 250, maxMs: 16000 })
  })

  test('an explicit override beats the environment', () => {
    expect(resolveRetryConfig({ maxRetries: 1 }, { ORCHENTRA_RETRY_MAX_ATTEMPTS: '9' })).toMatchObject({
      maxRetries: 1,
    })
  })

  test('ignores an unset or empty variable', () => {
    expect(resolveRetryConfig(undefined, { ORCHENTRA_RETRY_MAX_ATTEMPTS: '' })).toEqual(DEFAULT_RETRY_CONFIG)
  })

  test('throws on a malformed or out-of-range budget instead of falling back', () => {
    // A silently ignored budget is indistinguishable from an honoured one, and
    // the caller would never learn its sweep was still sleeping per call.
    for (const value of ['abc', '-1', '2.5', '999']) {
      expect(() => resolveRetryConfig(undefined, { ORCHENTRA_RETRY_MAX_ATTEMPTS: value })).toThrow(
        /ORCHENTRA_RETRY_MAX_ATTEMPTS must be an integer between 0 and 20/,
      )
    }
  })

  test('a ceiling below the first step is raised to it', () => {
    expect(
      resolveRetryConfig(undefined, { ORCHENTRA_RETRY_INITIAL_MS: '5000', ORCHENTRA_RETRY_MAX_MS: '1000' }),
    ).toMatchObject({ initialMs: 5000, maxMs: 5000 })
  })

  test('zero retries disables retrying', async () => {
    let calls = 0
    const response = await fetchWithRetry(
      async () => {
        calls++
        return new Response('limited', { status: 429 })
      },
      isRetryableStatus,
      {
        config: resolveRetryConfig(undefined, { ORCHENTRA_RETRY_MAX_ATTEMPTS: '0' }),
        sleep: async (): Promise<void> => {},
      },
    )
    expect(calls).toBe(1)
    expect(response.status).toBe(429)
  })
})
