import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { TOOL_ROW_DIM_AFTER_MS, TranscriptRowView } from '../../src/tui/components/Transcript'
import type { TranscriptRow } from '../../src/tui/types'

function toolCallRow(opts: { streaming: boolean; completedAt?: number }): TranscriptRow {
  return {
    kind: 'tool_call',
    id: 'tc1',
    toolUseId: 'tu1',
    name: 'Bash',
    input: '{"command":"ls"}',
    streaming: opts.streaming,
    completedAt: opts.completedAt,
  }
}

describe('TranscriptRowView dim flag for tool_call rows', () => {
  test('bright row renders tool name visibly', () => {
    const row = toolCallRow({ streaming: false, completedAt: Date.now() })
    const { lastFrame } = render(<TranscriptRowView row={row} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Bash')
    expect(frame).toContain('⏺')
  })

  test('dim row still shows the row content (just at muted palette)', () => {
    const row = toolCallRow({ streaming: false, completedAt: Date.now() - 10_000 })
    const { lastFrame } = render(<TranscriptRowView row={row} dim />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Bash')
    expect(frame).toContain('⏺')
  })

  test('streaming row never accepts dim styling', () => {
    const row = toolCallRow({ streaming: true })
    const { lastFrame } = render(<TranscriptRowView row={row} streaming />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Bash')
    expect(frame).toContain('…')
  })

  test('TOOL_ROW_DIM_AFTER_MS is the documented 5-second window', () => {
    expect(TOOL_ROW_DIM_AFTER_MS).toBe(5_000)
  })
})
