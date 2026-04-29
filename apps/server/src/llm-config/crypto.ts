import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

export interface EncryptedSecret {
  ciphertext: string
  iv: string
  tag: string
}

function getKey(): Buffer {
  const secret = process.env.LLM_CONFIG_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'LLM_CONFIG_SECRET env var must be set to a string of at least 16 characters before LLM keys can be encrypted/decrypted',
    )
  }
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptSecret(payload: EncryptedSecret): string {
  const key = getKey()
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const ct = Buffer.from(payload.ciphertext, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
