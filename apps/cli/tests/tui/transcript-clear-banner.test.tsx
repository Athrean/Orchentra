import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Transcript } from '../../src/tui/components/Transcript'

const BANNER = {
  cliName: 'orchentra',
  cliVersion: '0.1.0',
  model: 'claude-sonnet-4-20250514',
  permissionMode: 'workspace-write' as const,
  cwd: '/tmp/example',
  providerName: 'anthropic',
}

describe('Transcript banner on /clear remount', () => {
  test('does not reprint the banner when a new screen generation omits it', () => {
    const out = runWith({ NO_COLOR: '1', TERM_PROGRAM: 'vscode' }, () => {
      const { lastFrame, rerender } = render(
        <Transcript generation={0} streamingRowId={null} banner={BANNER} rows={[]} />,
      )
      const firstFrame = lastFrame() ?? ''

      // Mirrors what Tui.tsx does on /clear: screenGeneration increments
      // (changing the <Static> remount key) and the banner prop is omitted
      // for every generation after the first.
      rerender(
        <Transcript
          generation={1}
          streamingRowId={null}
          banner={undefined}
          rows={[{ kind: 'system', id: 'n1', text: 'Conversation cleared.', tone: 'info' }]}
        />,
      )
      return { firstFrame, secondFrame: lastFrame() ?? '' }
    })

    expect(out.firstFrame).toContain('v0.1.0')
    expect(out.secondFrame).not.toContain('v0.1.0')
    expect(out.secondFrame).toContain('Conversation cleared.')
  })
})

function runWith<T>(env: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  const touched = ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'TERM', 'TERM_PROGRAM']
  for (const key of touched) saved[key] = process.env[key]
  for (const key of touched) delete process.env[key]
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  try {
    return fn()
  } finally {
    for (const key of touched) {
      const prev = saved[key]
      if (prev === undefined) delete process.env[key]
      else process.env[key] = prev
    }
  }
}
