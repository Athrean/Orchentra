import { describe, expect, test } from 'bun:test'
import { evaluatePaste, expandPastes } from '../../src/tui/paste'

describe('evaluatePaste', () => {
  test('returns null for short single-line input', () => {
    expect(evaluatePaste('hello world')).toBeNull()
  })

  test('detects multi-line paste', () => {
    const result = evaluatePaste('a\nb\nc\nd\ne')
    expect(result).not.toBeNull()
    expect(result!.lines).toBe(5)
    expect(result!.chipMarker).toMatch(/\[Pasted #[a-z0-9]+ — 5 lines]/)
  })

  test('detects long single-line paste', () => {
    const big = 'x'.repeat(500)
    const result = evaluatePaste(big)
    expect(result).not.toBeNull()
  })
})

describe('expandPastes', () => {
  test('substitutes chip markers from registry', () => {
    const text = 'before [Pasted #abc123 — 4 lines] after'
    const out = expandPastes(text, { abc123: { content: 'hidden\nthing\n!' } })
    expect(out).toBe('before hidden\nthing\n! after')
  })

  test('leaves unknown chips as-is', () => {
    const text = '[Pasted #xx99 — 1 lines]'
    expect(expandPastes(text, {})).toBe(text)
  })
})
