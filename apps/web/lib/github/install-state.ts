import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * Signed install-state cookie payload. Carries the user id across the GH
 * install round-trip so the callback can attribute the installation to the
 * right Supabase auth.users row.
 *
 * Format: base64url(userId + '.' + nonce + '.' + ts) + '.' + hmac
 * Signed with INSTALL_STATE_SECRET (required — kept independent of the
 * Supabase service-role key so the two rotate separately).
 */

const TTL_SECONDS = 60 * 30

function getSecret(): string {
  const secret = process.env.INSTALL_STATE_SECRET
  if (!secret) throw new Error('INSTALL_STATE_SECRET is required (generate with: openssl rand -hex 32)')
  return secret
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function signInstallState(userId: string): string {
  const nonce = b64url(randomBytes(12))
  const ts = Date.now().toString()
  const payload = b64url(Buffer.from(`${userId}.${nonce}.${ts}`))
  const mac = b64url(createHmac('sha256', getSecret()).update(payload).digest())
  return `${payload}.${mac}`
}

export function verifyInstallState(state: string): { userId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [payload, mac] = parts
  const expected = b64url(createHmac('sha256', getSecret()).update(payload).digest())
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const decoded = b64urlDecode(payload).toString('utf8')
  const [userId, , tsStr] = decoded.split('.')
  if (!userId || !tsStr) return null
  const ts = Number(tsStr)
  if (!Number.isFinite(ts)) return null
  if (Date.now() - ts > TTL_SECONDS * 1000) return null
  return { userId }
}
