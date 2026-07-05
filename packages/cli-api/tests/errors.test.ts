import { describe, expect, test } from 'bun:test'
import {
  AnthropicApiError,
  classifyError,
  isRateLimitError,
  isRetryableStatus,
  enrichAuthError,
  missingCredentialsError,
} from '../src/errors'

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

describe('isRateLimitError', () => {
  test('true for a classified 429, false for a classified auth error', () => {
    expect(isRateLimitError(classifyError(429, '{"error":{"message":"slow down"}}'))).toBe(true)
    expect(isRateLimitError(classifyError(401, '{"error":{"message":"bad key"}}'))).toBe(false)
  })

  test('recognizes retry-exhausted wrappers by their preserved 429 status', () => {
    const exhausted429 = new AnthropicApiError({
      status: 429,
      message: 'Retries exhausted after 8 attempts: slow down',
      retryable: false,
      failureClass: 'provider_retry_exhausted',
    })
    const exhausted500 = new AnthropicApiError({
      status: 500,
      message: 'Retries exhausted after 8 attempts: internal error',
      retryable: false,
      failureClass: 'provider_retry_exhausted',
    })
    expect(isRateLimitError(exhausted429)).toBe(true)
    expect(isRateLimitError(exhausted500)).toBe(false)
  })

  test('recognizes plain Errors from the Gemini and OpenAI-compat clients', () => {
    expect(isRateLimitError(new Error('Gemini API error 429: {"error":{"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true)
    expect(isRateLimitError(new Error('ollama API error: 429 too many requests'))).toBe(true)
    expect(isRateLimitError(new Error('deepseek API error: 429 rate limit exceeded'))).toBe(true)
  })

  test('false for non-rate-limit plain Errors and non-Error values', () => {
    expect(isRateLimitError(new Error('Gemini API error 500: internal'))).toBe(false)
    expect(isRateLimitError(new Error('ollama API error: 401 unauthorized'))).toBe(false)
    expect(isRateLimitError(new Error('fetch failed'))).toBe(false)
    expect(isRateLimitError('429')).toBe(false)
    expect(isRateLimitError(undefined)).toBe(false)
  })
})
