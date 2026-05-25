import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.LLM_KEY_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('LLM_KEY_ENCRYPTION_KEY must be a 64-char hex string')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptSecret(packed: string): string {
  const [ivB64, tagB64, dataB64] = packed.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted payload')
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}
