import { describe, expect, test } from 'bun:test'
import { redactToJson } from '../src/agent/redact'

describe('redactToJson', () => {
  test('returns null for undefined', () => {
    expect(redactToJson(undefined)).toBeNull()
  })

  test('serializes plain objects as JSON', () => {
    expect(redactToJson({ ok: true, count: 3 })).toBe('{"ok":true,"count":3}')
  })

  test('masks Authorization header', () => {
    const out = redactToJson({ Authorization: 'Bearer ghp_secret_token' })
    expect(out).toBe('{"Authorization":"[REDACTED]"}')
  })

  test('masks any key containing token, password, or secret (case insensitive)', () => {
    const out = redactToJson({
      apiKey: 'k1',
      api_key: 'k2',
      githubToken: 'gh',
      Password: 'pw',
      DEEP_SECRET: 's',
      otherField: 'visible',
    })
    expect(out).toContain('"apiKey":"[REDACTED]"')
    expect(out).toContain('"api_key":"[REDACTED]"')
    expect(out).toContain('"githubToken":"[REDACTED]"')
    expect(out).toContain('"Password":"[REDACTED]"')
    expect(out).toContain('"DEEP_SECRET":"[REDACTED]"')
    expect(out).toContain('"otherField":"visible"')
  })

  test('masks secrets in nested objects and arrays', () => {
    const out = redactToJson({
      headers: { Authorization: 'Bearer abc' },
      requests: [{ token: 't1' }, { token: 't2' }],
    })
    expect(out).toContain('"Authorization":"[REDACTED]"')
    expect(out).toContain('"token":"[REDACTED]"')
    expect(out).not.toContain('Bearer abc')
    expect(out).not.toContain('"t1"')
  })

  test('truncates per-value strings beyond 4KB', () => {
    const huge = 'x'.repeat(10_000)
    const out = redactToJson({ body: huge }) as string
    expect(out).toContain('…[truncated]')
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThan(huge.length + 200)
  })

  test('caps total payload size to 16KB with a truncation envelope', () => {
    const out = redactToJson({
      one: 'a'.repeat(4000),
      two: 'b'.repeat(4000),
      three: 'c'.repeat(4000),
      four: 'd'.repeat(4000),
      five: 'e'.repeat(4000),
    }) as string
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(16 * 1024)
    const parsed = JSON.parse(out) as { truncated?: boolean; preview?: string }
    expect(parsed.truncated).toBe(true)
    expect(typeof parsed.preview).toBe('string')
  })

  test('preserves null, numbers, and booleans', () => {
    const out = redactToJson({ a: null, b: 42, c: false, d: 0 })
    expect(out).toBe('{"a":null,"b":42,"c":false,"d":0}')
  })

  test('handles non-secret string values verbatim under the cap', () => {
    const out = redactToJson({ message: 'hello world' })
    expect(out).toBe('{"message":"hello world"}')
  })
})
