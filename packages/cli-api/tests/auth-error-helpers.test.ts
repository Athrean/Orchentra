import { describe, expect, test } from 'bun:test'
import { AnthropicApiError, isProviderAuthError, friendlyAuthErrorMessage } from '../src/errors'

describe('isProviderAuthError', () => {
  test('returns true for a 401 AnthropicApiError', () => {
    const err = new AnthropicApiError({
      status: 401,
      message: 'unauthorized',
      retryable: false,
      failureClass: 'provider_auth',
    })
    expect(isProviderAuthError(err)).toBe(true)
  })

  test('returns true for the missing-credentials error', () => {
    const err = new AnthropicApiError({
      status: 0,
      message: 'No API key found.',
      retryable: false,
      failureClass: 'provider_auth',
    })
    expect(isProviderAuthError(err)).toBe(true)
  })

  test('returns false for non-auth AnthropicApiError', () => {
    const err = new AnthropicApiError({
      status: 500,
      message: 'transport',
      retryable: true,
      failureClass: 'provider_transport',
    })
    expect(isProviderAuthError(err)).toBe(false)
  })

  test('returns false for generic Error', () => {
    expect(isProviderAuthError(new Error('boom'))).toBe(false)
  })

  test('returns false for non-Error throwables', () => {
    expect(isProviderAuthError(null)).toBe(false)
    expect(isProviderAuthError(undefined)).toBe(false)
    expect(isProviderAuthError('string')).toBe(false)
    expect(isProviderAuthError({ failureClass: 'provider_auth' })).toBe(false)
  })
})

describe('friendlyAuthErrorMessage', () => {
  test('mentions the provider key was rejected', () => {
    const msg = friendlyAuthErrorMessage(
      new AnthropicApiError({
        status: 401,
        message: 'unauthorized',
        retryable: false,
        failureClass: 'provider_auth',
      }),
    )
    expect(msg.toLowerCase()).toContain('api key')
  })

  test('suggests orchentra reauth', () => {
    const msg = friendlyAuthErrorMessage(
      new AnthropicApiError({
        status: 401,
        message: 'unauthorized',
        retryable: false,
        failureClass: 'provider_auth',
      }),
    )
    expect(msg).toContain('orchentra reauth')
  })

  test('does not include raw stack-like content', () => {
    const msg = friendlyAuthErrorMessage(
      new AnthropicApiError({
        status: 401,
        message: 'at Function.foo (file.ts:123:45)\nstack trace here',
        retryable: false,
        failureClass: 'provider_auth',
      }),
    )
    expect(msg).not.toContain('at Function')
    expect(msg).not.toContain('file.ts:123')
  })
})
