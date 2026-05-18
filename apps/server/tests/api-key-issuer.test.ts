import { describe, expect, test } from 'bun:test'
import { mintApiKey, hashApiKey } from '../src/github/api-key-issuer'

describe('mintApiKey', () => {
  test('returns a plaintext + matching SHA-256 hash', () => {
    const { plaintext, hash } = mintApiKey()
    expect(plaintext.length).toBeGreaterThanOrEqual(43) // base64(32 bytes) - padding ≈ 43
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiKey(plaintext)).toBe(hash)
  })

  test('produces a new plaintext on each call', () => {
    const a = mintApiKey()
    const b = mintApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).not.toBe(b.hash)
  })

  test('hashApiKey is deterministic for the same input', () => {
    expect(hashApiKey('hello')).toBe(hashApiKey('hello'))
    expect(hashApiKey('hello')).not.toBe(hashApiKey('world'))
  })
})
