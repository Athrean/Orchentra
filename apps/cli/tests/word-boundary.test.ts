import { describe, expect, test } from 'bun:test'
import { deleteWordBack, wordBoundaryLeft, wordBoundaryRight } from '../src/tui/word-boundary'

describe('wordBoundaryLeft', () => {
  test('jumps over adjacent whitespace then over the previous word', () => {
    expect(wordBoundaryLeft('hello world', 11)).toBe(6)
    expect(wordBoundaryLeft('hello world', 6)).toBe(0)
  })

  test('returns 0 when cursor sits on whitespace at the start', () => {
    expect(wordBoundaryLeft('   hi', 3)).toBe(0)
  })

  test('handles cursor past the buffer end gracefully', () => {
    expect(wordBoundaryLeft('hi', 999)).toBe(0)
  })

  test('skips multiple whitespace runs as a single boundary', () => {
    expect(wordBoundaryLeft('foo    bar', 10)).toBe(7)
  })
})

describe('wordBoundaryRight', () => {
  test('jumps over adjacent whitespace then over the next word', () => {
    expect(wordBoundaryRight('hello world', 0)).toBe(5)
    expect(wordBoundaryRight('hello world', 5)).toBe(11)
  })

  test('returns buffer length when no further word exists', () => {
    expect(wordBoundaryRight('hi   ', 2)).toBe(5)
  })

  test('handles negative cursor gracefully', () => {
    expect(wordBoundaryRight('hi', -1)).toBe(2)
  })
})

describe('deleteWordBack', () => {
  test('removes the word ending at the cursor + leaves the suffix intact', () => {
    expect(deleteWordBack('alpha beta gamma', 10)).toEqual({ buffer: 'alpha  gamma', cursor: 6 })
  })

  test('is a no-op when the cursor is at 0', () => {
    expect(deleteWordBack('hello', 0)).toEqual({ buffer: 'hello', cursor: 0 })
  })
})
