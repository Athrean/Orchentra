import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Footer } from '../src/tui/components/Footer'
import type { TurnStatus } from '../src/tui/types'

const IDLE: TurnStatus = {
  state: 'idle',
  tokens: { inputTokens: 0, outputTokens: 0 },
}

function makeRunning(over: Partial<Extract<TurnStatus, { state: 'running' }>> = {}): TurnStatus {
  return {
    state: 'running',
    startedAt: 0,
    elapsedMs: 39_000,
    verb: 'Crystallising',
    tokens: { inputTokens: 1234, outputTokens: 754 },
    ...over,
  }
}

function strip(frame: string): string {
  // eslint-disable-next-line no-control-regex
  return frame.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('Footer — running', () => {
  test('renders single dim line: * <verb>… <elapsed>s ↑<input> ↓<output> (esc to interrupt)', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        cwd="/tmp"
        turn={makeRunning()}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toMatch(/\*\s+Crystallising…\s+39s\s+↑1234\s+↓754\s+\(esc to interrupt\)/)
  })

  test('omits a token glyph entirely when its count is zero', () => {
    const turn = makeRunning({ tokens: { inputTokens: 0, outputTokens: 754 } })
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        cwd="/tmp"
        turn={turn}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('↓754')
    expect(out).not.toContain('↑0')
    expect(out).toContain('(esc to interrupt)')
  })
})

describe('Footer — idle', () => {
  test('does not render the running-line glyph when idle', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        cwd="/tmp"
        branch="main"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).not.toContain('(esc to interrupt)')
    expect(out).toContain('claude-opus-4-7')
    expect(out).toContain('git:(main)')
  })

  test('shows an explicit danger warning for danger-full-access mode', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="danger-full-access"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('danger-full-access ⚠')
  })

  test('shows that allow mode skips permission prompts', () => {
    const { lastFrame } = render(
      <Footer model="claude-opus-4-7" mode="allow" cwd="/tmp" turn={IDLE} spinnerFrame={0} exitHintActive={false} />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('allow ⚠ skip permissions')
  })
})
