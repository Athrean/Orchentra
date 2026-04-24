import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { generatePkce, generateState, buildAuthorizeUrl } from '../src/oauth-pkce'

describe('generatePkce', () => {
  test('returns S256 method', () => {
    const p = generatePkce()
    expect(p.method).toBe('S256')
  })

  test('challenge = base64url(sha256(verifier))', () => {
    const p = generatePkce()
    const expected = createHash('sha256')
      .update(p.verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(p.challenge).toBe(expected)
  })

  test('verifier is base64url (no padding, no + or /)', () => {
    const p = generatePkce()
    expect(p.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(p.verifier.length).toBeGreaterThanOrEqual(43)
  })

  test('successive pairs are unique', () => {
    const a = generatePkce()
    const b = generatePkce()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('generateState', () => {
  test('produces unique base64url strings', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('buildAuthorizeUrl', () => {
  test('appends params as query string', () => {
    const url = buildAuthorizeUrl('https://example.com/authorize', {
      response_type: 'code',
      client_id: 'abc',
      scope: 'read write',
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://example.com/authorize')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('abc')
    expect(parsed.searchParams.get('scope')).toBe('read write')
  })

  test('preserves pre-existing query', () => {
    const url = buildAuthorizeUrl('https://example.com/authorize?foo=bar', {
      client_id: 'abc',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('foo')).toBe('bar')
    expect(parsed.searchParams.get('client_id')).toBe('abc')
  })
})
