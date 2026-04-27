/**
 * Redact tool-call args/results before persisting to tool_calls.
 *
 * - Mask known secret-looking keys with the literal string '[REDACTED]'.
 * - Cap each leaf value at MAX_VALUE_BYTES of UTF-8 once serialized.
 * - The full serialized payload is also capped at MAX_TOTAL_BYTES.
 *
 * Match is case-insensitive and runs against any key whose name *contains*
 * one of the SECRET_KEY_FRAGMENTS — covers `apiKey`, `api_key`, `token`,
 * `Authorization`, `password`, `secret`, etc.
 */

const MAX_VALUE_BYTES = 4 * 1024
const MAX_TOTAL_BYTES = 16 * 1024

const SECRET_KEY_FRAGMENTS = [
  'apikey',
  'api_key',
  'token',
  'authorization',
  'password',
  'secret',
  'credential',
  'private_key',
  'privatekey',
  'session',
] as const

const REDACTED = '[REDACTED]'
const TRUNCATED_SUFFIX = '…[truncated]'

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase()
  return SECRET_KEY_FRAGMENTS.some((frag) => k.includes(frag))
}

function truncateString(value: string, max: number): string {
  if (Buffer.byteLength(value, 'utf8') <= max) return value
  const headroom = max - TRUNCATED_SUFFIX.length
  if (headroom <= 0) return TRUNCATED_SUFFIX
  return value.slice(0, headroom) + TRUNCATED_SUFFIX
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value, MAX_VALUE_BYTES)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? REDACTED : redactValue(v)
    }
    return out
  }
  return String(value)
}

/**
 * Redact a payload and return a JSON string capped at MAX_TOTAL_BYTES.
 * Returns null when the input is undefined.
 */
export function redactToJson(payload: unknown): string | null {
  if (payload === undefined) return null
  const redacted = redactValue(payload)
  let serialized: string
  try {
    serialized = JSON.stringify(redacted)
  } catch {
    serialized = JSON.stringify({ error: 'unserialisable payload' })
  }
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_TOTAL_BYTES) return serialized
  return JSON.stringify({
    truncated: true,
    preview: truncateString(serialized, MAX_TOTAL_BYTES - 64),
  })
}
