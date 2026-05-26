import { describe, expect, test, beforeAll } from 'bun:test'
import { encryptSecret, decryptSecret } from '../lib/crypto'

beforeAll(() => {
  process.env.LLM_KEY_ENCRYPTION_KEY = 'dea34d2b9b56800a6efa237f6b42cc0040f325800873a211143ec6edf433dfb5'
})

describe('crypto', () => {
  test('round-trips short and long secrets', () => {
    for (const plaintext of ['sk-ant-abc', 'x'.repeat(512)]) {
      const enc = encryptSecret(plaintext)
      expect(enc).not.toBe(plaintext)
      expect(decryptSecret(enc)).toBe(plaintext)
    }
  })

  test('produces a fresh IV per call (ciphertext changes for same plaintext)', () => {
    const a = encryptSecret('same-secret')
    const b = encryptSecret('same-secret')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-secret')
    expect(decryptSecret(b)).toBe('same-secret')
  })

  test('rejects malformed payloads', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow()
  })

  test('rejects tampered ciphertext', () => {
    const enc = encryptSecret('original-secret-value')
    const [iv, tag, data] = enc.split('.')
    const buf = Buffer.from(data, 'base64')
    buf[0] = buf[0] ^ 0xff
    const tampered = [iv, tag, buf.toString('base64')].join('.')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
