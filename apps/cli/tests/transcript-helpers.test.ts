import { describe, expect, test } from 'bun:test'
import { summarizeToolArgs, splitPreviewLines } from '../src/tui/components/Transcript'

describe('summarizeToolArgs', () => {
  test('formats JSON object args as comma-joined k=v', () => {
    const out = summarizeToolArgs('{"path":"/tmp/a","limit":10}')
    expect(out).toBe('path=/tmp/a, limit=10')
  })

  test('truncates very long string values inside args', () => {
    const long = 'x'.repeat(80)
    const out = summarizeToolArgs(JSON.stringify({ q: long }))
    expect(out.startsWith('q=')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(101)
    expect(out.endsWith('…')).toBe(true)
  })

  test('passes through non-JSON inputs with truncation only', () => {
    expect(summarizeToolArgs('hello world')).toBe('hello world')
  })

  test('falls back to raw truncation on malformed JSON', () => {
    const broken = '{not really json}'
    expect(summarizeToolArgs(broken)).toBe(broken)
  })
})

describe('splitPreviewLines', () => {
  test('returns all lines when below the cap', () => {
    expect(splitPreviewLines('a\nb\nc', 5)).toEqual(['a', 'b', 'c'])
  })

  test('elides the overflow with a tail counting remaining lines', () => {
    const out = splitPreviewLines('1\n2\n3\n4\n5\n6\n7', 3)
    expect(out).toEqual(['1', '2', '3', '…(4 more lines)'])
  })

  test('singularises the elide tail at exactly one extra line', () => {
    const out = splitPreviewLines('1\n2\n3\n4', 3)
    expect(out[out.length - 1]).toBe('…(1 more line)')
  })

  test('drops trailing blank lines', () => {
    expect(splitPreviewLines('a\nb\n\n\n', 5)).toEqual(['a', 'b'])
  })

  test('empty input still returns one row so the layout never collapses', () => {
    expect(splitPreviewLines('', 5)).toEqual([''])
  })
})
