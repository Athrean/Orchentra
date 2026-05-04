import { describe, expect, test } from 'bun:test'
import { builtinRecipes, RecoveryGiveUpError, withRecovery, type Recipe } from '../src/recovery/recipes'

function makeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = []
  return {
    sleep: async (ms): Promise<void> => {
      delays.push(ms)
      return Promise.resolve()
    },
    delays,
  }
}

function makeFailing(times: number, err: unknown): () => Promise<string> {
  let n = 0
  return async () => {
    if (n < times) {
      n++
      throw err
    }
    return 'ok'
  }
}

describe('builtinRecipes', () => {
  test('matches 429 status (number)', () => {
    const e = Object.assign(new Error('rate limited'), { status: 429 })
    expect(builtinRecipes.some((r) => r.matcher(e))).toBe(true)
  })

  test('matches "429" in error message', () => {
    expect(builtinRecipes.some((r) => r.matcher(new Error('HTTP 429 Too Many Requests')))).toBe(true)
  })

  test('matches ECONNRESET code', () => {
    const e = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    expect(builtinRecipes.some((r) => r.matcher(e))).toBe(true)
  })

  test('matches ETIMEDOUT code', () => {
    const e = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    expect(builtinRecipes.some((r) => r.matcher(e))).toBe(true)
  })

  test('does not match arbitrary error', () => {
    expect(builtinRecipes.some((r) => r.matcher(new Error('boom')))).toBe(false)
  })
})

describe('withRecovery', () => {
  test('returns result on first success', async () => {
    const { sleep, delays } = makeSleep()
    const result = await withRecovery(async () => 'ok', { sleep })
    expect(result).toBe('ok')
    expect(delays).toEqual([])
  })

  test('non-matching error throws immediately, no retry', async () => {
    const { sleep, delays } = makeSleep()
    let calls = 0
    const fn = async (): Promise<string> => {
      calls++
      throw new Error('non-transient')
    }
    await expect(withRecovery(fn, { sleep })).rejects.toThrow('non-transient')
    expect(calls).toBe(1)
    expect(delays).toEqual([])
  })

  test('retries matched error and succeeds', async () => {
    const { sleep, delays } = makeSleep()
    const err = Object.assign(new Error('429'), { status: 429 })
    const result = await withRecovery(makeFailing(2, err), { sleep })
    expect(result).toBe('ok')
    expect(delays).toEqual([100, 200])
  })

  test('exp backoff caps at capMs', async () => {
    const { sleep, delays } = makeSleep()
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    await withRecovery(makeFailing(5, err), { sleep, maxRetries: 5, baseMs: 1000, capMs: 3000 })
    expect(delays).toEqual([1000, 2000, 3000, 3000, 3000])
  })

  test('gives up after maxRetries → RecoveryGiveUpError with attempts + elapsedMs', async () => {
    const { sleep } = makeSleep()
    const err = Object.assign(new Error('429'), { status: 429 })
    let caught: unknown
    try {
      await withRecovery(makeFailing(99, err), { sleep, maxRetries: 3 })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(RecoveryGiveUpError)
    const g = caught as RecoveryGiveUpError
    expect(g.attempts).toBe(4) // 1 initial + 3 retries
    expect(g.recipe).toBe('http_429')
    expect(g.cause).toBe(err)
    expect(g.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(g.message).toContain('tried 4 times')
  })

  test('onRetry callback fires per retry with attempt + delay + recipe', async () => {
    const { sleep } = makeSleep()
    const err = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    const events: Array<{ attempt: number; delay: number; recipe: string }> = []
    await withRecovery(makeFailing(2, err), {
      sleep,
      onRetry: ({ attempt, delay, recipe }) => events.push({ attempt, delay, recipe }),
    })
    expect(events).toEqual([
      { attempt: 1, delay: 100, recipe: 'econn_reset' },
      { attempt: 2, delay: 200, recipe: 'econn_reset' },
    ])
  })

  test('custom recipe registry honored', async () => {
    const { sleep, delays } = makeSleep()
    const recipe: Recipe = {
      name: 'flaky_api',
      matcher: (e) => e instanceof Error && e.message === 'flaky',
    }
    await withRecovery(makeFailing(1, new Error('flaky')), { sleep, recipes: [recipe] })
    expect(delays).toEqual([100])
  })
})
