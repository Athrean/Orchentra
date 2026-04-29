import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { ShimmerText, shimmerSpansFor } from '../src/tui/components/ShimmerText'

describe('shimmerSpansFor', () => {
  test('returns one span per character preserving the original text', () => {
    const spans = shimmerSpansFor('thinking…', 0)
    expect(spans.length).toBe('thinking…'.length)
    expect(spans.map((s) => s.ch).join('')).toBe('thinking…')
  })

  test('highlights a contiguous band that moves between frames', () => {
    const f0 = shimmerSpansFor('thinking…', 0)
    const f4 = shimmerSpansFor('thinking…', 4)
    const hi0 = f0.map((s) => s.hilite).join(',')
    const hi4 = f4.map((s) => s.hilite).join(',')
    expect(hi0).not.toBe(hi4)
  })

  test('every frame highlights at least one char somewhere in the cycle', () => {
    const text = 'thinking'
    const period = text.length + 5
    const seen = new Set<number>()
    for (let f = 0; f < period; f++) {
      const spans = shimmerSpansFor(text, f)
      spans.forEach((s, i) => {
        if (s.hilite) seen.add(i)
      })
    }
    expect(seen.size).toBeGreaterThan(text.length / 2)
  })

  test('empty text yields no spans', () => {
    expect(shimmerSpansFor('', 0)).toEqual([])
  })
})

describe('ShimmerText', () => {
  test('renders the full text at any frame (ANSI stripped)', () => {
    const { lastFrame: f0 } = render(<ShimmerText text="thinking…" frame={0} />)
    const { lastFrame: f7 } = render(<ShimmerText text="thinking…" frame={7} />)
    // eslint-disable-next-line no-control-regex
    const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')
    expect(stripAnsi(f0() ?? '').trimEnd()).toBe('thinking…')
    expect(stripAnsi(f7() ?? '').trimEnd()).toBe('thinking…')
  })

  test('handles empty text', () => {
    const { lastFrame } = render(<ShimmerText text="" frame={0} />)
    expect(lastFrame()).toBeDefined()
  })
})
