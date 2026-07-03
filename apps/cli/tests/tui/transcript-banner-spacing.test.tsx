import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { Transcript } from '../../src/tui/components/Transcript'

describe('Transcript banner spacing', () => {
  test('keeps a blank line between the compact banner and first row', () => {
    const out = runWith({ NO_COLOR: '1', TERM_PROGRAM: 'vscode' }, () => {
      const { lastFrame } = render(
        <Transcript
          generation={0}
          streamingRowId={null}
          banner={{
            cliName: 'orchentra',
            cliVersion: '0.1.0',
            model: 'claude-sonnet-4-20250514',
            permissionMode: 'workspace-write',
            cwd: '/tmp/example',
            providerName: 'anthropic',
          }}
          rows={[{ kind: 'user', id: 'u1', text: '/config' }]}
        />,
      )
      return lastFrame() ?? ''
    })

    expect(out).toContain('\n\n > /config\n\n')
  })

  test('keeps a blank line between a card header and its body', () => {
    const out = runWith({ NO_COLOR: '1', TERM_PROGRAM: 'vscode' }, () => {
      const { lastFrame } = render(
        <Transcript
          generation={0}
          streamingRowId={null}
          rows={[
            {
              kind: 'card',
              id: 'c1',
              title: 'Config',
              sections: [{ title: 'Session', rows: [{ key: 'model', value: '(default)' }] }],
            },
          ]}
        />,
      )
      return lastFrame() ?? ''
    })

    expect(out).toContain('Config\n\n Session')
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
