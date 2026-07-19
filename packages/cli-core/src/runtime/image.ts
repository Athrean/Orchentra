/**
 * Canonical image payload carried alongside a message's text. Base64 is the
 * one shape all three provider wire formats accept (Anthropic base64 source,
 * OpenAI `data:` URL, Gemini inlineData), so we normalize on it rather than
 * duplicating a URL variant per provider.
 */
export interface ImageContent {
  /** Base64-encoded image bytes (no `data:` prefix). */
  readonly data: string
  /** IANA media type, e.g. `image/png`. */
  readonly mediaType: string
}

/**
 * Send-time guardrails. Caps below the tightest provider limit (Anthropic:
 * 5 MB/image, 8000 px/edge) so a payload accepted here is accepted by every
 * provider. Oversized images are rejected with a clear message rather than
 * silently dropped.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8000

export interface ImageLimits {
  maxBytes?: number
  maxDimension?: number
}

/** Decoded byte length of a base64 string, computed from length + padding. */
export function decodedByteLength(base64: string): number {
  const len = base64.length
  if (len === 0) return 0
  let padding = 0
  if (base64.endsWith('==')) padding = 2
  else if (base64.endsWith('=')) padding = 1
  return Math.floor((len * 3) / 4) - padding
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Reads width/height from a PNG's IHDR chunk (the first chunk, at a fixed
 * offset). Returns null for anything that is not a PNG — the byte cap still
 * applies, but the pixel-dimension check is skipped for formats we don't parse.
 * NOTE (deliberate ceiling): PNG-only dimension read; screenshots are PNG. Add
 * JPEG SOF scanning only if a non-PNG image source appears.
 */
export function pngDimensions(base64: string): { width: number; height: number } | null {
  const buf = Buffer.from(base64, 'base64')
  // 8-byte signature + 4-byte length + "IHDR" + 4-byte width + 4-byte height.
  if (buf.length < 24) return null
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/**
 * Returns a human-readable rejection reason if the image breaches a cap, or
 * null if it is within limits. Never mutates; callers decide whether to surface
 * the string as a tool error or throw.
 */
export function checkImageLimits(image: ImageContent, limits: ImageLimits = {}): string | null {
  const maxBytes = limits.maxBytes ?? MAX_IMAGE_BYTES
  const maxDimension = limits.maxDimension ?? MAX_IMAGE_DIMENSION

  const bytes = decodedByteLength(image.data)
  if (bytes > maxBytes) {
    return `image exceeds the ${maxBytes}-byte cap (${bytes} bytes)`
  }

  const dims = pngDimensions(image.data)
  if (dims && (dims.width > maxDimension || dims.height > maxDimension)) {
    return `image dimension ${dims.width}x${dims.height} exceeds the ${maxDimension}px cap`
  }

  return null
}
