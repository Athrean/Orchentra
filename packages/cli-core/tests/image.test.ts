import { describe, expect, test } from 'bun:test'
import {
  checkImageLimits,
  decodedByteLength,
  pngDimensions,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
} from '../src/runtime/image'

// A real 1x1 PNG (transparent). IHDR encodes width=1, height=1.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('decodedByteLength', () => {
  test('computes the decoded byte length of a base64 payload without allocating a full buffer', () => {
    const bytes = decodedByteLength(PNG_1X1)
    // Round-trip check against the actual decode.
    expect(bytes).toBe(Buffer.from(PNG_1X1, 'base64').byteLength)
    expect(bytes).toBeGreaterThan(0)
  })

  test('accounts for base64 padding', () => {
    expect(decodedByteLength('AAAA')).toBe(3) // 4 chars, no padding → 3 bytes
    expect(decodedByteLength('AAA=')).toBe(2)
    expect(decodedByteLength('AA==')).toBe(1)
  })
})

describe('pngDimensions', () => {
  test('reads width and height from the PNG IHDR chunk', () => {
    expect(pngDimensions(PNG_1X1)).toEqual({ width: 1, height: 1 })
  })

  test('returns null for a non-PNG payload (dimension check skipped, byte cap still applies)', () => {
    expect(pngDimensions(Buffer.from('not a png').toString('base64'))).toBeNull()
  })
})

describe('checkImageLimits', () => {
  test('passes a small valid PNG', () => {
    expect(checkImageLimits({ data: PNG_1X1, mediaType: 'image/png' })).toBeNull()
  })

  test('rejects an oversized payload by byte cap with a clear message', () => {
    const err = checkImageLimits({ data: PNG_1X1, mediaType: 'image/png' }, { maxBytes: 1 })
    expect(err).toContain('exceeds')
    expect(err).toContain('byte')
  })

  test('rejects oversized pixel dimensions with a clear message', () => {
    const err = checkImageLimits({ data: PNG_1X1, mediaType: 'image/png' }, { maxDimension: 0 })
    expect(err).toContain('dimension')
  })

  test('exposes sane default caps', () => {
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(0)
    expect(MAX_IMAGE_DIMENSION).toBeGreaterThan(0)
  })
})
