import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { ReasoningBlock } from '../../src/tui/components/ReasoningBlock'
import type { ReasoningRow } from '../../src/tui/types'

// ink-testing-library renders with chalk disabled, so colour bytes never
// reach the frame string. The shimmer palette cycle is unit-tested via
// `useShimmer` + `pickShimmer`. These component tests cover the rest of the
// OBSERVABLE behaviour: frame churn while streaming, frame stability when
// finalized, and the 2-second-idle elapsed counter.

function streamingRow(over: Partial<ReasoningRow> = {}): ReasoningRow {
  return {
    kind: 'reasoning',
    id: 'shimmer-row',
    text: 'partial thought',
    startedAt: Date.now() - 50,
    endedAt: null,
    expanded: false,
    ...over,
  }
}

function finalRow(over: Partial<ReasoningRow> = {}): ReasoningRow {
  const now = Date.now()
  return {
    kind: 'reasoning',
    id: 'final-row',
    text: 'final thought',
    startedAt: now - 3000,
    endedAt: now,
    expanded: false,
    ...over,
  }
}

describe('ReasoningBlock streaming animation', () => {
  test('finalized row is byte-stable across re-renders (no shimmer)', async () => {
    const row = finalRow()
    const { lastFrame, rerender } = render(<ReasoningBlock row={row} />)
    const before = lastFrame()
    await Bun.sleep(200)
    rerender(<ReasoningBlock row={row} />)
    expect(lastFrame()).toBe(before)
  })

  test('streaming row with fresh text shows only verb + ellipsis (no elapsed)', () => {
    const row = streamingRow({ startedAt: Date.now() - 100, text: 'fresh thought' })
    const { lastFrame } = render(<ReasoningBlock row={row} />)
    const out = lastFrame() ?? ''
    expect(out).toMatch(/\*\s+\w+…/)
    // No elapsed counter while the stream is fresh — neither an "<n>s" nor
    // an "<n>ms" segment should appear in the collapsed summary.
    expect(out).not.toMatch(/\d+\s*m?s/)
  })

  test('idle for >2s while streaming surfaces an elapsed counter', async () => {
    const row = streamingRow({
      startedAt: Date.now() - 2200,
      text: 'stale thought',
    })
    const { lastFrame, rerender } = render(<ReasoningBlock row={row} />)
    // Wait one shimmer tick so the component re-evaluates the idle window.
    await Bun.sleep(180)
    rerender(<ReasoningBlock row={row} />)
    const out = lastFrame() ?? ''
    expect(out).toMatch(/\*\s+\w+…\s+\d+s/)
  })

  test('ctrl+r toggle path is preserved: expanded view shows the full text', () => {
    const row = streamingRow({ expanded: true, text: 'visible thought' })
    const { lastFrame } = render(<ReasoningBlock row={row} />)
    expect(lastFrame() ?? '').toContain('visible thought')
  })
})
