import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_PREFIX = 'orch_'

export function generateProjectApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export function hashProjectApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenDisplayPrefix(token: string): string {
  return token.slice(0, 12)
}

export function verifyProjectApiToken(token: string, hash: string): boolean {
  const actual = Buffer.from(hashProjectApiToken(token), 'hex')
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
