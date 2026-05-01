import { describe, expect, test } from 'bun:test'
import { previewToolResult, prettyPrintIfJson } from '../src/tui/components/tool-preview'

describe('prettyPrintIfJson', () => {
  test('pretty-prints a JSON object', () => {
    const out = prettyPrintIfJson('{"a":1,"b":{"c":2}}')
    expect(out).toBe('{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}')
  })

  test('pretty-prints a JSON array', () => {
    const out = prettyPrintIfJson('[1,2,3]')
    expect(out).toBe('[\n  1,\n  2,\n  3\n]')
  })

  test('returns scalar primitives unchanged', () => {
    expect(prettyPrintIfJson('"hello"')).toBe('"hello"')
    expect(prettyPrintIfJson('42')).toBe('42')
    expect(prettyPrintIfJson('null')).toBe('null')
  })

  test('returns plain text unchanged', () => {
    expect(prettyPrintIfJson('hello world')).toBe('hello world')
    expect(prettyPrintIfJson('error: not found')).toBe('error: not found')
  })

  test('returns malformed JSON unchanged', () => {
    expect(prettyPrintIfJson('{ not json')).toBe('{ not json')
  })

  test('returns empty string unchanged', () => {
    expect(prettyPrintIfJson('')).toBe('')
  })
})

describe('previewToolResult', () => {
  test('short text fits — no truncation, no expand affordance', () => {
    const out = previewToolResult('hello', { maxLines: 3, maxChars: 200 })
    expect(out.lines).toEqual(['hello'])
    expect(out.truncated).toBe(false)
    expect(out.hiddenLines).toBe(0)
  })

  test('pretty-prints JSON before measuring', () => {
    const json = JSON.stringify({ totalCount: 21, items: [1, 2, 3, 4, 5] })
    const out = previewToolResult(json, { maxLines: 3, maxChars: 1000 })
    expect(out.lines[0]).toBe('{')
    expect(out.lines.length).toBeLessThanOrEqual(3)
    expect(out.truncated).toBe(true)
  })

  test('truncates by line count, reports hidden lines', () => {
    const out = previewToolResult('1\n2\n3\n4\n5\n6\n7', { maxLines: 3, maxChars: 1000 })
    expect(out.lines).toEqual(['1', '2', '3'])
    expect(out.truncated).toBe(true)
    expect(out.hiddenLines).toBe(4)
  })

  test('truncates by char count even on a single long line', () => {
    const long = 'x'.repeat(500)
    const out = previewToolResult(long, { maxLines: 5, maxChars: 100 })
    expect(out.lines.length).toBe(1)
    expect(out.lines[0].length).toBe(100)
    expect(out.truncated).toBe(true)
  })

  test('drops trailing blank lines before counting', () => {
    const out = previewToolResult('a\nb\n\n\n', { maxLines: 5, maxChars: 200 })
    expect(out.lines).toEqual(['a', 'b'])
    expect(out.truncated).toBe(false)
  })

  test('empty input yields one empty row so layout does not collapse', () => {
    const out = previewToolResult('', { maxLines: 3, maxChars: 100 })
    expect(out.lines).toEqual([''])
    expect(out.truncated).toBe(false)
    expect(out.hiddenLines).toBe(0)
  })

  test('full mode returns every line ignoring caps', () => {
    const text = Array.from({ length: 100 }, (_, i) => String(i)).join('\n')
    const out = previewToolResult(text, { maxLines: 3, maxChars: 50, full: true })
    expect(out.lines.length).toBe(100)
    expect(out.truncated).toBe(false)
  })
})
