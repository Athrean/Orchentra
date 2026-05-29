import { describe, expect, test } from 'bun:test'
import { safeGraphRead } from '../lib/graph/result'

describe('safeGraphRead', () => {
  test('returns ok with data on success', async () => {
    const result = await safeGraphRead('x', [], async () => [1, 2, 3])
    expect(result).toEqual({ status: 'ok', data: [1, 2, 3] })
  })

  test('returns empty when the read yields an empty array', async () => {
    const result = await safeGraphRead('x', [], async () => [])
    expect(result.status).toBe('empty')
  })

  test('returns error with the fallback when the read throws', async () => {
    const result = await safeGraphRead('x', ['fallback'], async () => {
      throw new Error('db down')
    })
    expect(result).toEqual({ status: 'error', data: ['fallback'] })
  })

  test('honors a custom isEmpty predicate', async () => {
    const result = await safeGraphRead(
      'x',
      { count: 0 },
      async () => ({ count: 0 }),
      (d) => d.count === 0,
    )
    expect(result.status).toBe('empty')
  })
})
