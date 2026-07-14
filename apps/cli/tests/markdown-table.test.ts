import { describe, expect, test } from 'bun:test'
import { computeColumnWidths, inlineWidth, wrapCell } from '../src/tui/markdown/table'

describe('inlineWidth', () => {
  test('measures plain text by code points', () => {
    expect(inlineWidth('hello')).toBe(5)
  })

  test('keeps backticks in a code span width', () => {
    expect(inlineWidth('`x`')).toBe(3)
  })

  test('counts a link as text plus ` (href)` when they differ', () => {
    expect(inlineWidth('[docs](https://x.io)')).toBe('docs'.length + ' (https://x.io)'.length)
  })

  test('bold contributes only its inner text', () => {
    expect(inlineWidth('**bold**')).toBe(4)
  })
})

describe('computeColumnWidths', () => {
  test('uses natural widths when the table fits', () => {
    const widths = computeColumnWidths(
      ['id', 'name'],
      [
        ['1', 'alice'],
        ['22', 'bob'],
      ],
      80,
    )
    expect(widths).toEqual([2, 5])
  })

  test('shrinks the widest column first when over budget', () => {
    const long = 'x'.repeat(50)
    const [idW, textW] = computeColumnWidths(['id', 'text'], [['1', long]], 30)
    expect(idW).toBe(2)
    expect(textW).toBeLessThan(50)
    // Row must fit: overhead is 3*cols + 1 = 7, so content budget is 23.
    expect(idW + textW).toBeLessThanOrEqual(23)
  })
})

describe('wrapCell', () => {
  test('keeps a short cell on one line', () => {
    expect(wrapCell('hi there', 20)).toEqual(['hi there'])
  })

  test('wraps on word boundaries to the column width', () => {
    expect(wrapCell('one two three four', 8)).toEqual(['one two', 'three', 'four'])
  })

  test('hard-breaks a single word longer than the column', () => {
    expect(wrapCell('abcdefgh', 3)).toEqual(['abc', 'def', 'gh'])
  })

  test('never returns an empty array for an empty cell', () => {
    expect(wrapCell('', 5)).toEqual([''])
  })
})
