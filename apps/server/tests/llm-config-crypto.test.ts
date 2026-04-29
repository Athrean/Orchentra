import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

const ORIGINAL_SECRET = process.env.LLM_CONFIG_SECRET

beforeAll(() => {
  process.env.LLM_CONFIG_SECRET = 'test-secret-min-16-bytes-long'
})

afterAll(() => {
  process.env.LLM_CONFIG_SECRET = ORIGINAL_SECRET
})

const { encryptSecret, decryptSecret } = await import('../src/llm-config/crypto')

describe('llm-config crypto', () => {
  test('roundtrips a key through encrypt → decrypt', () => {
    const plaintext = 'sk-or-v1-1234567890abcdef'
    const enc = encryptSecret(plaintext)

    expect(enc.ciphertext).not.toBe(plaintext)
    expect(enc.iv).toBeDefined()
    expect(enc.tag).toBeDefined()

    expect(decryptSecret(enc)).toBe(plaintext)
  })

  test('produces a fresh IV per call', () => {
    const a = encryptSecret('same-secret')
    const b = encryptSecret('same-secret')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  test('decrypt fails on tampered ciphertext', () => {
    const enc = encryptSecret('hello')
    const tampered = { ...enc, ciphertext: 'AAAA' + enc.ciphertext.slice(4) }
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
