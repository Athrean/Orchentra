import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { DEFAULT_STATUSLINE_CONFIG, type StatuslineConfig } from '../../src/statusline'
import { StatuslineConfigCard } from '../../src/tui/components/StatuslineConfigCard'

describe('StatuslineConfigCard', () => {
  test('renders supported and unavailable Codex-style options', () => {
    const { lastFrame } = render(
      <StatuslineConfigCard current={DEFAULT_STATUSLINE_CONFIG} onSave={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Configure Status Line')
    expect(out).toContain('Current: model-with-reasoning, current-dir, git-branch, context-used +4 more')
    expect(out).toContain('model-with-reasoning')
    expect(out).toContain('five-hour-limit')
    expect(out).toContain('(unavailable)')
    expect(out).toContain('enter to apply now')
  })

  test('space toggles the highlighted supported row and enter saves', async () => {
    let saved: StatuslineConfig | null = null
    const { stdin } = render(
      <StatuslineConfigCard
        current={{ useThemeColors: true, fields: ['model'] }}
        onSave={(config) => {
          saved = config
        }}
        onCancel={() => {}}
      />,
    )

    stdin.write('\x1b[B') // model-with-reasoning
    await wait()
    stdin.write(' ')
    await wait()
    stdin.write('\r')
    await wait()

    expect(saved).toEqual({ useThemeColors: true, fields: ['model', 'model-with-reasoning'] })
  })

  test('search filters rows by label', async () => {
    const { lastFrame, stdin } = render(
      <StatuslineConfigCard
        current={{ useThemeColors: true, fields: ['thread-id'] }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )

    stdin.write('thread')
    await wait()

    const out = lastFrame() ?? ''
    expect(out).toContain('thread-id')
    expect(out).toContain('thread-title')
    expect(out).not.toContain('current-dir')
  })

  test('escape cancels without saving', async () => {
    let cancelled = false
    let saved = false
    const { stdin } = render(
      <StatuslineConfigCard
        current={DEFAULT_STATUSLINE_CONFIG}
        onSave={() => {
          saved = true
        }}
        onCancel={() => {
          cancelled = true
        }}
      />,
    )

    stdin.write('\x03')
    await wait()

    expect(cancelled).toBe(true)
    expect(saved).toBe(false)
  })
})

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10))
}
