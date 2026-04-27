#!/usr/bin/env bun
/**
 * Visual check: prints the WelcomeBanner at several terminal widths by giving
 * Ink a custom stdout stream whose `.columns` we control. Output is written to
 * the *real* stdout so we can eyeball the frames.
 */
import { EventEmitter } from 'node:events'
import React from 'react'
import { render } from 'ink'
import { WelcomeBanner } from '../src/render/banner'

const WIDTHS = [30, 50, 70, 78, 90, 120, 160]

const opts = {
  cliName: 'orchentra',
  cliVersion: '0.1.0',
  model: 'claude-sonnet-4-6-20250514',
  permissionMode: 'workspace-write' as const,
  cwd: '/Users/rushout/Desktop/Orchentra',
  branch: 'main',
  workspaceStatus: '2 changes',
  providerName: 'anthropic',
  sessionId: 'abcdef1234567890',
}

/** Minimal NodeJS.WriteStream stand-in with a configurable `columns`. */
function makeFakeStdout(cols: number): NodeJS.WriteStream {
  let buf = ''
  const stream = new EventEmitter() as unknown as NodeJS.WriteStream & { output: () => string }
  stream.write = ((chunk: string | Uint8Array) => {
    buf += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }) as NodeJS.WriteStream['write']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(stream as any).isTTY = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(stream as any).columns = cols
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(stream as any).rows = 40
  stream.output = () => buf
  return stream
}

for (const cols of WIDTHS) {
  process.stdout.write(`\n\u2500\u2500\u2500 cols=${cols} \u2500\u2500\u2500\n`)
  const fakeStdout = makeFakeStdout(cols) as NodeJS.WriteStream & { output: () => string }
  const instance = render(<WelcomeBanner {...opts} />, {
    stdout: fakeStdout,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  await new Promise<void>((resolve) => setImmediate(resolve))
  instance.unmount()
  // Strip ink's cursor + synchronized-update escapes for cleaner preview output.
  // eslint-disable-next-line no-control-regex
  process.stdout.write(fakeStdout.output().replace(/\x1b\[\?(25|2026)[hl]/g, ''))
  process.stdout.write('\n')
}
