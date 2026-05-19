import { describe, expect, test } from 'bun:test'
import { countWrappedLines } from '../../src/tui/use-line-count'

describe('countWrappedLines', () => {
  test('empty buffer counts as one line', () => {
    expect(countWrappedLines('', 80)).toBe(1)
  })

  test('single short line', () => {
    expect(countWrappedLines('hello', 80)).toBe(1)
  })

  test('counts explicit newlines', () => {
    expect(countWrappedLines('a\nb\nc', 80)).toBe(3)
  })

  test('wraps lines longer than width', () => {
    // 'a' repeated 20 times, width 10 → 2 wrapped lines
    expect(countWrappedLines('a'.repeat(20), 10)).toBe(2)
  })

  test('wraps and counts mixed content', () => {
    // line 1: 5 chars (fits width 10) → 1 wrapped
    // line 2: 25 chars at width 10 → 3 wrapped
    // line 3: 0 chars (trailing newline counted as a line)
    expect(countWrappedLines('hello\n' + 'a'.repeat(25), 10)).toBe(1 + 3)
  })

  test('empty trailing line is counted', () => {
    expect(countWrappedLines('a\n', 80)).toBe(2)
  })

  test('exact-width line does not over-wrap', () => {
    expect(countWrappedLines('a'.repeat(10), 10)).toBe(1)
  })

  test('width <= 0 falls back to logical line count', () => {
    expect(countWrappedLines('a\nb', 0)).toBe(2)
    expect(countWrappedLines('a\nb', -5)).toBe(2)
  })

  test('returns >= 5 when the buffer wraps past the modal threshold', () => {
    // 5 explicit lines.
    expect(countWrappedLines('1\n2\n3\n4\n5', 80)).toBe(5)
  })

  test('four logical lines without wrap stay below the threshold', () => {
    expect(countWrappedLines('1\n2\n3\n4', 80)).toBe(4)
  })
})
