import { describe, expect, test } from 'bun:test'
import { isPlainText } from '../src/tui/markdown/short-circuit'

describe('isPlainText', () => {
  test('returns true for prose with no markdown markers', () => {
    expect(isPlainText('hello world, this is a sentence.')).toBe(true)
  })

  test('empty input is plain text', () => {
    expect(isPlainText('')).toBe(true)
  })

  test('detects backtick as a marker', () => {
    expect(isPlainText('use the `foo` function')).toBe(false)
  })

  test('detects hash as a marker (heading)', () => {
    expect(isPlainText('# Heading')).toBe(false)
  })

  test('detects asterisk as a marker (bold/italic/list)', () => {
    expect(isPlainText('a *word* here')).toBe(false)
  })

  test('detects underscore as a marker (italic)', () => {
    expect(isPlainText('a _word_ here')).toBe(false)
  })

  test('detects gt as a marker (blockquote)', () => {
    expect(isPlainText('> quoted')).toBe(false)
  })

  test('detects dash as a marker (list/hr)', () => {
    expect(isPlainText('- item')).toBe(false)
  })

  test('detects bracket as a marker (link)', () => {
    expect(isPlainText('see [docs](https://example.com)')).toBe(false)
  })

  test('detects tilde as a marker (fenced code, strikethrough)', () => {
    expect(isPlainText('~~~js\ncode\n~~~')).toBe(false)
  })

  test('only inspects the first 500 chars — marker after the window is ignored', () => {
    const head = 'a'.repeat(500)
    expect(isPlainText(head + '# late heading')).toBe(true)
  })

  test('marker at position 499 still counts (within window)', () => {
    const head = 'a'.repeat(499)
    expect(isPlainText(head + '#')).toBe(false)
  })
})
