import { describe, expect, test } from 'bun:test'
import { findStreamSafeBoundary } from '../src/runtime/markdown/stream-boundary'

describe('findStreamSafeBoundary', () => {
  test('empty buffer returns null (no boundary yet)', () => {
    expect(findStreamSafeBoundary('')).toBeNull()
  })

  test('paragraph followed by blank line yields boundary right after the blank', () => {
    const md = 'hello world\n\n'
    // boundary must include the blank line so caller drains both paragraph + blank
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('single paragraph without trailing blank line returns null', () => {
    expect(findStreamSafeBoundary('hello world\n')).toBeNull()
    expect(findStreamSafeBoundary('hello world')).toBeNull()
  })

  test('inside an open code fence, blank lines do NOT count as a boundary', () => {
    const md = 'intro\n\n```py\nimport os\n\nx = 1\n'
    // boundary should be at the blank after "intro" (offset 7), NOT inside the fence
    expect(findStreamSafeBoundary(md)).toBe(7)
  })

  test('boundary right after a closing fence', () => {
    const md = '```py\nimport os\n```\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('tilde fences obey the same open/close rule', () => {
    const md = '~~~py\nimport os\n~~~\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('opener with backticks cannot be closed by tildes (and vice versa)', () => {
    const md = '```py\nimport os\n~~~\n\n'
    // backtick fence is still open, so the trailing blank does not count
    expect(findStreamSafeBoundary(md)).toBeNull()
  })

  test('returns the LAST safe boundary across multiple paragraphs', () => {
    const md = 'first\n\nsecond\n\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('boundary advances after a closed fence followed by a paragraph', () => {
    const md = '```\ncode\n```\n\nafter\n\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('a closing fence shorter than the opener does not close it', () => {
    const md = '````py\nimport os\n```\n\n'
    expect(findStreamSafeBoundary(md)).toBeNull()
  })

  test('a longer-than-required closing fence still closes', () => {
    const md = '```py\nimport os\n````\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })

  test('opener with info string containing backtick is NOT treated as a fence', () => {
    const md = 'inline ``` ` not opener\n\n'
    expect(findStreamSafeBoundary(md)).toBe(md.length)
  })
})
