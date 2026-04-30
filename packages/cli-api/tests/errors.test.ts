import { describe, expect, test } from 'bun:test'
import { classifyError, isRetryableStatus, enrichAuthError, missingCredentialsError } from '../src/errors'

describe('errors', () => {
  test('classifies 401 as auth error', () => {
    const err = classifyError(401, '{"error":{"message":"bad key"}}', 'authentication_error')
    expect(err.failureClass).toBe('provider_auth')
    expect(err.retryable).toBe(false)
  })

  test('classifies 429 as rate limit and retryable', () => {
    const err = classifyError(429, '{"error":{"message":"slow down"}}')
    expect(err.failureClass).toBe('provider_rate_limit')
    expect(err.retryable).toBe(true)
  })

  test('classifies 500 as retryable transport', () => {
    const err = classifyError(500, 'internal server error')
    expect(err.retryable).toBe(true)
  })

  test('classifies context window errors from body text', () => {
    const err = classifyError(400, '{"error":{"message":"prompt is too long"}}')
    expect(err.failureClass).toBe('context_window')
    expect(err.retryable).toBe(false)
  })

  test('isRetryableStatus', () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
  })

  test('enrichAuthError hints when sk-ant-api03- API key wedged into bearer slot', () => {
    const original = classifyError(401, 'bad token')
    const enriched = enrichAuthError(original, 'bearer', 'sk-ant-api03-test123')
    expect(enriched.message).toContain('sk-ant-api03-* keys go in ANTHROPIC_API_KEY')
  })

  test('enrichAuthError does NOT hint when sk-ant-oat01- OAuth bearer is in correct slot', () => {
    const original = classifyError(401, 'OAuth not supported')
    const enriched = enrichAuthError(original, 'bearer', 'sk-ant-oat01-correct-token')
    expect(enriched.message).toBe(original.message)
    expect(enriched.message).not.toContain('ANTHROPIC_API_KEY')
  })

  test('enrichAuthError does not modify non-bearer auth', () => {
    const original = classifyError(401, 'bad token')
    const enriched = enrichAuthError(original, 'api_key', 'sk-ant-api03-test')
    expect(enriched.message).toBe(original.message)
  })

  test('missingCredentialsError', () => {
    const err = missingCredentialsError()
    expect(err.failureClass).toBe('provider_auth')
    expect(err.retryable).toBe(false)
    expect(err.message).toContain('ANTHROPIC_API_KEY')
  })
})
