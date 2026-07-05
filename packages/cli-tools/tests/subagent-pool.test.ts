import { describe, expect, test } from 'bun:test'
import { runSubagentPool } from '../src/tools/subagent-pool'

describe('runSubagentPool', () => {
  test('runs every task and returns values in task order with zero requeues', async () => {
    const results = await runSubagentPool(['a', 'b', 'c'], {
      limit: 2,
      run: async (task) => `ran:${task}`,
    })
    expect(results.map((r) => r.value)).toEqual(['ran:a', 'ran:b', 'ran:c'])
    expect(results.map((r) => r.requeues)).toEqual([0, 0, 0])
  })

  test('requeues a flagged task with backoff and lets it succeed on a later attempt', async () => {
    const attempts: Record<string, number> = { a: 0, b: 0 }
    const sleeps: number[] = []
    const results = await runSubagentPool(['a', 'b'], {
      limit: 2,
      run: async (task) => {
        attempts[task]!++
        if (task === 'b' && attempts.b === 1) return 'rate-limited'
        return `ok:${task}`
      },
      shouldRequeue: (value) => value === 'rate-limited',
      sleep: async (ms) => {
        sleeps.push(ms)
      },
    })
    expect(results.map((r) => r.value)).toEqual(['ok:a', 'ok:b'])
    expect(results[1]!.requeues).toBe(1)
    expect(attempts.a).toBe(1)
    expect(attempts.b).toBe(2)
    expect(sleeps.length).toBe(1)
    expect(sleeps[0]!).toBeGreaterThan(0)
  })

  test('stops requeueing after the cap and records the last value with its requeue count', async () => {
    let runs = 0
    const results = await runSubagentPool(['a'], {
      limit: 1,
      run: async () => {
        runs++
        return 'rate-limited'
      },
      shouldRequeue: () => true,
      sleep: async () => {},
    })
    expect(runs).toBe(3)
    expect(results[0]!.value).toBe('rate-limited')
    expect(results[0]!.requeues).toBe(2)
  })

  test('holds the concurrency cap while a requeued task retries', async () => {
    const state = { current: 0, max: 0 }
    let bAttempts = 0
    const results = await runSubagentPool(['a', 'b', 'c', 'd', 'e', 'f'], {
      limit: 2,
      run: async (task) => {
        state.current++
        state.max = Math.max(state.max, state.current)
        await new Promise((resolve) => setTimeout(resolve, 2))
        state.current--
        if (task === 'b' && ++bAttempts === 1) return 'rate-limited'
        return `ok:${task}`
      },
      shouldRequeue: (value) => value === 'rate-limited',
      sleep: async () => {},
    })
    expect(state.max).toBeLessThanOrEqual(2)
    expect(results.map((r) => r.value)).toEqual(['ok:a', 'ok:b', 'ok:c', 'ok:d', 'ok:e', 'ok:f'])
  })
})
