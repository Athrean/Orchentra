import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { verifySentrySignature } from '../src/integrations/sentry'

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf-8').digest('hex')
}

describe('verifySentrySignature', () => {
  const secret = 'shh-its-a-secret'
  const body = '{"action":"triggered","data":{"issue":{"id":"1"}}}'

  test('accepts a correctly signed payload', () => {
    const sig = sign(body, secret)
    expect(verifySentrySignature(body, sig, secret)).toBe(true)
  })

  test('rejects when signature is wrong length (would otherwise crash timingSafeEqual)', () => {
    expect(verifySentrySignature(body, 'short', secret)).toBe(false)
  })

  test('rejects when signature is the right length but wrong value', () => {
    const wrong = sign(body, 'different-secret')
    expect(verifySentrySignature(body, wrong, secret)).toBe(false)
  })

  test('rejects when body has been tampered with', () => {
    const sig = sign(body, secret)
    expect(verifySentrySignature(body + ' ', sig, secret)).toBe(false)
  })

  test('rejects empty / null signature', () => {
    expect(verifySentrySignature(body, '', secret)).toBe(false)
    expect(verifySentrySignature(body, null as unknown as string, secret)).toBe(false)
    expect(verifySentrySignature(body, undefined as unknown as string, secret)).toBe(false)
  })
})
