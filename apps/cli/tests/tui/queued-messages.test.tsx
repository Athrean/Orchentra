import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { QueuedMessages } from '../../src/tui/components/QueuedMessages'

describe('QueuedMessages', () => {
  test('renders nothing when the queue is empty', () => {
    const { lastFrame } = render(<QueuedMessages queued={[]} />)
    expect((lastFrame() ?? '').trim()).toBe('')
  })

  test('previews each queued message on its own line', () => {
    const { lastFrame } = render(<QueuedMessages queued={['run the tests', 'then deploy']} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('queued')
    expect(out).toContain('run the tests')
    expect(out).toContain('then deploy')
  })

  test('collapses newlines and truncates long messages', () => {
    const { lastFrame } = render(<QueuedMessages queued={['line one\nline two']} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('line one line two')
    expect(out).not.toContain('\nline two')
  })
})
