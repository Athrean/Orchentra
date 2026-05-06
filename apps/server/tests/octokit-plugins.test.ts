import { describe, expect, test } from 'bun:test'
import { buildThrottleOptions, SOFT_REMAINING_FLOOR } from '../src/github/octokit-plugins'

function makeLog(): { log: typeof console; calls: string[] } {
  const calls: string[] = []
  return {
    log: {
      warn: (msg: string) => calls.push(msg),
    } as unknown as typeof console,
    calls,
  }
}

describe('buildThrottleOptions', () => {
  test('retries primary rate-limit hit exactly once', () => {
    const { log, calls } = makeLog()
    const opts = buildThrottleOptions('pat', log)
    expect(opts.onRateLimit(1, { method: 'GET', url: '/repos/x/y' }, undefined, 0)).toBe(true)
    expect(opts.onRateLimit(1, { method: 'GET', url: '/repos/x/y' }, undefined, 1)).toBe(false)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('primary rate-limit')
    expect(calls[0]).toContain('pat')
  })

  test('retries secondary rate-limit hit exactly once', () => {
    const { log, calls } = makeLog()
    const opts = buildThrottleOptions('app:42', log)
    expect(opts.onSecondaryRateLimit(2, { method: 'POST', url: '/foo' }, undefined, 0)).toBe(true)
    expect(opts.onSecondaryRateLimit(2, { method: 'POST', url: '/foo' }, undefined, 1)).toBe(false)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('secondary rate-limit')
    expect(calls[0]).toContain('app:42')
  })

  test('SOFT_REMAINING_FLOOR is a sane positive number', () => {
    expect(SOFT_REMAINING_FLOOR).toBeGreaterThan(0)
  })
})
