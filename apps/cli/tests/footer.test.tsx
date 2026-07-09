import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import type { SessionTaskSummary } from '@orchentra/cli-core'
import { Footer } from '../src/tui/status/Footer'
import type { TurnStatus } from '../src/tui/types'

function makeTask(status: SessionTaskSummary['status']): SessionTaskSummary {
  return { id: status, status, createdAt: '2026-07-06T00:00:00.000Z' }
}

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
        terseMode="off"
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
        terseMode="off"
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
        terseMode="off"
        cwd="/tmp"
        branch="main"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).not.toContain('(esc to interrupt)')
    expect(out).toContain('Opus 4.7')
    expect(out).not.toContain('claude-opus-4-7')
    expect(out).toContain('git:(main)')
  })

  test('uses clean model labels for explicit model statusline fields', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-sonnet-4-20250514"
        mode="workspace-write"
        terseMode="off"
        effort="medium"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        statusline={{ useThemeColors: true, fields: ['model', 'model-with-reasoning'] }}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('Sonnet 4')
    expect(out).toContain('Sonnet 4 · medium')
    expect(out).not.toContain('claude-sonnet-4-20250514')
  })

  test('shows workspace leaf and context percentage when stats are available', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/Users/rushout/Desktop/Orchentra"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        contextStats={{ estimatedTokens: 50_000, contextWindowTokens: 200_000, compactThresholdRatio: 0.8 }}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('Orchentra')
    expect(out).toContain('ctx 25%')
  })

  test('shows an explicit danger warning for danger-full-access mode', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="danger-full-access"
        terseMode="off"
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
      <Footer
        model="claude-opus-4-7"
        mode="allow"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('allow ⚠ skip permissions')
  })

  test('names the exit key in the double-press hint', () => {
    const ctrlD = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive
        exitHintKey="ctrl+d"
      />,
    )
    expect(strip(ctrlD.lastFrame() ?? '')).toContain('press Ctrl+D again to exit')

    const ctrlC = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive
        exitHintKey="ctrl+c"
      />,
    )
    expect(strip(ctrlC.lastFrame() ?? '')).toContain('press Ctrl+C again to exit')
  })

  test('shows terse mode when enabled', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="full"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('terse:full')
  })
})

describe('Footer — background tasks', () => {
  test('shows a pluralized indicator counting only running/pending tasks', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        tasks={[makeTask('running'), makeTask('pending'), makeTask('completed')]}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('⚙ 2 tasks')
  })

  test('uses the singular noun for exactly one active task', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        tasks={[makeTask('running')]}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('⚙ 1 task')
    expect(out).not.toContain('tasks')
  })

  test('renders nothing when every task is terminal', () => {
    const { lastFrame } = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        tasks={[makeTask('completed'), makeTask('failed'), makeTask('cancelled')]}
      />,
    )
    const out = strip(lastFrame() ?? '')
    expect(out).not.toContain('⚙')
    expect(out).not.toContain('task')
  })

  test('renders nothing when the task list is empty or undefined', () => {
    const empty = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
        tasks={[]}
      />,
    )
    expect(strip(empty.lastFrame() ?? '')).not.toContain('⚙')

    const absent = render(
      <Footer
        model="claude-opus-4-7"
        mode="workspace-write"
        terseMode="off"
        cwd="/tmp"
        turn={IDLE}
        spinnerFrame={0}
        exitHintActive={false}
      />,
    )
    expect(strip(absent.lastFrame() ?? '')).not.toContain('⚙')
  })
})
