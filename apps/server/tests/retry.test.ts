import { describe, expect, test } from 'bun:test'
import { classifyError, withRetry, ToolError } from '../src/agent/retry'

describe('classifyError', () => {
  test('Response 429 + 5xx are retryable', () => {
    expect(classifyError(new Response(null, { status: 429 }))).toBe('retryable')
    expect(classifyError(new Response(null, { status: 503 }))).toBe('retryable')
  })

  test('Response 401/403/404 are permanent', () => {
    expect(classifyError(new Response(null, { status: 401 }))).toBe('permanent')
    expect(classifyError(new Response(null, { status: 403 }))).toBe('permanent')
    expect(classifyError(new Response(null, { status: 404 }))).toBe('permanent')
  })

  test('object with status field follows the same rules', () => {
    expect(classifyError({ status: 502 })).toBe('retryable')
    expect(classifyError({ status: 401 })).toBe('permanent')
  })

  test('network errors are retryable', () => {
    expect(classifyError(new Error('ECONNRESET'))).toBe('retryable')
    expect(classifyError(new Error('ETIMEDOUT'))).toBe('retryable')
  })

  test('ToolError carries the retryable flag through classification', () => {
    expect(classifyError(new ToolError('flaky', { retryable: true }))).toBe('retryable')
    expect(classifyError(new ToolError('bad input', { retryable: false }))).toBe('permanent')
  })

  test('unknown errors default to permanent', () => {
    expect(classifyError(new Error('weird'))).toBe('permanent')
  })
})

describe('withRetry', () => {
  test('retries on retryable error and eventually succeeds', async () => {
    let attempts = 0
    const result = await withRetry(
      async () => {
        attempts++
        if (attempts < 3) throw new Error('ECONNRESET')
        return 'ok'
      },
      { maxAttempts: 3, initialMs: 1, maxMs: 4 },
    )
    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  test('does not retry on permanent error', async () => {
    let attempts = 0
    await expect(
      withRetry(
        async () => {
          attempts++
          throw new Response(null, { status: 401 })
        },
        { maxAttempts: 3, initialMs: 1, maxMs: 4 },
      ),
    ).rejects.toBeDefined()
    expect(attempts).toBe(1)
  })

  test('throws last error when maxAttempts is exhausted', async () => {
    let attempts = 0
    await expect(
      withRetry(
        async () => {
          attempts++
          throw new Error('ECONNRESET')
        },
        { maxAttempts: 2, initialMs: 1, maxMs: 4 },
      ),
    ).rejects.toThrow('ECONNRESET')
    expect(attempts).toBe(2)
  })
})
