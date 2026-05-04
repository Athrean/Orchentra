import { describe, expect, test } from 'bun:test'
import { findStreamSafeBoundary, splitAtStreamBoundary } from '../src/tui/markdown/stream'

describe('findStreamSafeBoundary', () => {
  test('zero-length input returns 0', () => {
    expect(findStreamSafeBoundary('')).toBe(0)
  })

  test('plain prose with no blank line returns 0 (entire text pending)', () => {
    expect(findStreamSafeBoundary('hello world, mid-sentence...')).toBe(0)
  })

  test('paragraph followed by blank line is safe through the blank', () => {
    const text = 'one paragraph.\n\nstill typing'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(0, cut)).toBe('one paragraph.\n\n')
    expect(text.slice(cut)).toBe('still typing')
  })

  test('closed fence is safe through the closing line', () => {
    const text = '```ts\nconst x = 1\n```\nnext paragraph...'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(0, cut).endsWith('```\n')).toBe(true)
    expect(text.slice(cut)).toBe('next paragraph...')
  })

  test('open fence with no closer marks the fence-open line as the boundary', () => {
    const text = 'intro paragraph\n\n```ts\nconst x = 1\nconst y'
    const cut = findStreamSafeBoundary(text)
    expect(text.slice(cut).startsWith('```ts')).toBe(true)
  })
})

describe('splitAtStreamBoundary', () => {
  test('round-trips the input as safe + pending', () => {
    const text = 'one\n\ntwo\n\nthree (mid)'
    const { safe, pending } = splitAtStreamBoundary(text)
    expect(safe + pending).toBe(text)
    expect(pending).toBe('three (mid)')
  })

  test('fully-safe input has empty pending', () => {
    const text = 'paragraph one.\n\nparagraph two.\n\n'
    const { pending } = splitAtStreamBoundary(text)
    expect(pending).toBe('')
  })
})
