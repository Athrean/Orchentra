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

  test('treats CR-separated drag-drop paths as a paste and normalizes CR to LF', () => {
    // Terminals convert LF to CR when pasting/dragging; a bare \r reaching the
    // buffer overwrites the rendered row and deforms the input box.
    const result = evaluatePaste("'/Users/u/Desktop/a.png'\r'/Users/u/Desktop/b.png'")
    expect(result).not.toBeNull()
    expect(result!.lines).toBe(2)
    expect(result!.content).toBe("'/Users/u/Desktop/a.png'\n'/Users/u/Desktop/b.png'")
  })

  test('treats a short two-line blob as a paste (no line-count floor above 2)', () => {
    const result = evaluatePaste('line one\nline two')
    expect(result).not.toBeNull()
    expect(result!.lines).toBe(2)
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

// ── Bracketed paste ────────────────────────────────────────────────────────
// A large paste reaches stdin split across however many reads the tty felt
// like. Judged chunk by chunk it rendered as six chips
// (`[paste · 10 lines][paste · 36 lines]…`); Ink's bracketed-paste channel
// hands the whole thing over at once, so one paste has to make one chip.

describe('whole-paste handling', () => {
  test('one call over the full text yields one chip carrying every line', () => {
    const text = Array.from({ length: 152 }, (_, i) => `line ${i + 1}`).join('\n')
    const decision = evaluatePaste(text)
    expect(decision).not.toBeNull()
    expect(decision?.lines).toBe(152)
    expect(decision?.chipMarker).toBe(`[Pasted #${decision?.chipId} — 152 lines]`)
  })

  test('the chip round-trips back to the exact pasted text', () => {
    const text = 'first\nsecond\nthird\n'.repeat(40)
    const decision = evaluatePaste(text)
    expect(decision).not.toBeNull()
    const registry = { [decision!.chipId]: { content: decision!.content } }
    expect(expandPastes(`before ${decision!.chipMarker} after`, registry)).toBe(`before ${text} after`)
  })

  test('a short paste is still inserted literally, not chipped', () => {
    expect(evaluatePaste('npm run build')).toBeNull()
  })
})
