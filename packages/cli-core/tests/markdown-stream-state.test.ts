import { describe, expect, test } from 'bun:test'
import { MarkdownStreamState } from '../src/runtime/markdown/stream-boundary'

describe('MarkdownStreamState', () => {
  test('push with no safe boundary yields null and buffers everything', () => {
    const s = new MarkdownStreamState()
    expect(s.push('hello')).toBeNull()
    expect(s.push(' world')).toBeNull()
    // nothing has been drained yet
    expect(s.flush()).toBe('hello world')
  })

  test('push returns the prefix up to the boundary and drains it', () => {
    const s = new MarkdownStreamState()
    expect(s.push('para1\n\n')).toBe('para1\n\n')
    // buffer is now empty; further push without boundary yields null
    expect(s.push('partial')).toBeNull()
  })

  test('push only releases at the latest boundary, not earlier ones', () => {
    const s = new MarkdownStreamState()
    expect(s.push('a\n\nb\n\n')).toBe('a\n\nb\n\n')
  })

  test('push across two calls accumulates and releases when fence closes', () => {
    const s = new MarkdownStreamState()
    expect(s.push('```py\nx = 1\n')).toBeNull()
    expect(s.push('```\n')).toBe('```py\nx = 1\n```\n')
  })

  test('flush returns null when buffer is empty or whitespace-only', () => {
    const s = new MarkdownStreamState()
    expect(s.flush()).toBeNull()
    s.push('   \n')
    expect(s.flush()).toBeNull()
  })

  test('flush returns and clears any non-whitespace remainder', () => {
    const s = new MarkdownStreamState()
    s.push('tail without blank')
    expect(s.flush()).toBe('tail without blank')
    expect(s.flush()).toBeNull()
  })

  test('boundary inside a delta only releases the prefix; remainder stays buffered', () => {
    const s = new MarkdownStreamState()
    expect(s.push('para\n\nstart of next')).toBe('para\n\n')
    expect(s.flush()).toBe('start of next')
  })
})
