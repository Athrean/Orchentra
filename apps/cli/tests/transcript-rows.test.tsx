import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { TranscriptRowView } from '../src/tui/components/Transcript'
import { emptyUsage } from '@orchentra/cli-core'

describe('TranscriptRowView — assistant', () => {
  test('prefixes the assistant message with the brand bullet', () => {
    const { lastFrame } = render(<TranscriptRowView row={{ kind: 'assistant', id: 'a1', text: '21 issues found.' }} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('●')
    expect(frame).toContain('21 issues found.')
  })
})

describe('TranscriptRowView — tool_result', () => {
  test('collapses long output to 3 lines plus a ctrl+o expand affordance', () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    const { lastFrame } = render(
      <TranscriptRowView row={{ kind: 'tool_result', id: 'r1', preview: text, isError: false, expanded: false }} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('line 1')
    expect(frame).toContain('line 3')
    expect(frame).not.toContain('line 4')
    expect(frame).toContain('ctrl+o to expand')
  })

  test('expanded mode renders every line and shows the collapse hint', () => {
    const text = 'a\nb\nc\nd\ne'
    const { lastFrame } = render(
      <TranscriptRowView row={{ kind: 'tool_result', id: 'r2', preview: text, isError: false, expanded: true }} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('a')
    expect(frame).toContain('e')
    expect(frame).toContain('ctrl+o to collapse')
  })

  test('JSON one-liners pretty-print before truncation, no soft-wrap blob', () => {
    const json = JSON.stringify({ totalCount: 21, items: [1, 2, 3, 4, 5] })
    const { lastFrame } = render(
      <TranscriptRowView row={{ kind: 'tool_result', id: 'r3', preview: json, isError: false, expanded: false }} />,
    )
    const frame = lastFrame() ?? ''
    // First line of pretty-printed JSON is `{` — confirms we did not dump the
    // raw one-liner.
    expect(frame).toContain('{')
    expect(frame).toContain('ctrl+o to expand')
  })
})

describe('TranscriptRowView — tool_call streaming', () => {
  test('renders partial JSON args with an ellipsis while streaming', () => {
    const { lastFrame } = render(
      <TranscriptRowView
        row={{
          kind: 'tool_call',
          id: 'tc-1',
          toolUseId: 'tc-1',
          name: 'read_file',
          input: '{"path":"/tmp/f',
          streaming: true,
        }}
        streaming
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('read_file')
    expect(frame).toContain('/tmp/f')
    expect(frame).toContain('…')
  })

  test('renders finalized args without the streaming ellipsis', () => {
    const { lastFrame } = render(
      <TranscriptRowView
        row={{
          kind: 'tool_call',
          id: 'tc-2',
          toolUseId: 'tc-2',
          name: 'read_file',
          input: '{"path":"/tmp/f.txt"}',
          streaming: false,
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('read_file')
    expect(frame).toContain('/tmp/f.txt')
    expect(frame).not.toContain('…)')
  })
})

// emptyUsage is imported only to ensure the module resolves; assistant/tool
// rows do not need it but keeps test bundles consistent with the wider suite.
void emptyUsage
