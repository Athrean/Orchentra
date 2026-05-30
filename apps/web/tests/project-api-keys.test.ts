import { describe, expect, it } from 'bun:test'
import {
  generateProjectApiToken,
  hashProjectApiToken,
  tokenDisplayPrefix,
  verifyProjectApiToken,
} from '../lib/api-keys/project-api-keys'

describe('project api keys', () => {
  it('generates an opaque token and stores only a hashable form', () => {
    const token = generateProjectApiToken()
    const hash = hashProjectApiToken(token)

    expect(token.startsWith('orch_')).toBe(true)
    expect(hash).not.toBe(token)
    expect(hash).toHaveLength(64)
    expect(tokenDisplayPrefix(token)).toBe(token.slice(0, 12))
  })

  it('verifies a plaintext token against the stored hash', () => {
    const token = generateProjectApiToken()
    const hash = hashProjectApiToken(token)

    expect(verifyProjectApiToken(token, hash)).toBe(true)
    expect(verifyProjectApiToken(`${token}x`, hash)).toBe(false)
  })
})
