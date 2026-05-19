import { EventEmitter } from 'node:events'
import React from 'react'
import { Box, render, Text, useApp } from 'ink'
import { THEME } from '../tui/theme'

export interface WelcomeTipsOptions {
  readonly cliName: string
  readonly username?: string
}

const TIPS: ReadonlyArray<readonly [string, string]> = [
  ['type a message', 'ask anything — free-form prompts run an AI turn against the current model'],
  ['paste a log', 'drop a failing CI log to start an investigation'],
  ['/help', 'list every command grouped by category · /help <op> for parameter detail'],
  ['/triage', 'debug a failing GitHub Actions run in one slash'],
  ['/login', 'connect Anthropic, OpenAI, OpenRouter, or another provider'],
]

function capitalize(value: string): string {
  if (value.length === 0) return value
  return value[0].toUpperCase() + value.slice(1)
}

function WelcomeTips(props: WelcomeTipsOptions): React.ReactElement {
  const greeting = props.username ? `Welcome back, ${props.username}.` : `Welcome to ${capitalize(props.cliName)}.`
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={THEME.brand} paddingX={1}>
      <Text bold>{greeting}</Text>
      <Text dimColor>Tips for getting started:</Text>
      <Box height={1} />
      {TIPS.map(([key, label], i) => (
        <Box key={key} flexDirection="row">
          <Text color={THEME.brand}>{`${i + 1}. `}</Text>
          <Text bold>{key}</Text>
          <Text dimColor>{`  ${label}`}</Text>
        </Box>
      ))}
    </Box>
  )
}

function OneShot(props: WelcomeTipsOptions): React.ReactElement {
  const { exit } = useApp()
  React.useEffect(() => {
    const t = setTimeout(exit, 0)
    return () => clearTimeout(t)
  }, [exit])
  return <WelcomeTips {...props} />
}

interface CapturedStdout {
  readonly stream: NodeJS.WriteStream
  readonly read: () => string
}

function createCapturedStdout(columns: number, rows: number): CapturedStdout {
  let buf = ''
  const stream = new EventEmitter() as unknown as NodeJS.WriteStream
  stream.write = ((chunk: string | Uint8Array) => {
    buf += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }) as NodeJS.WriteStream['write']
  Object.defineProperties(stream, {
    isTTY: { value: true, configurable: true },
    columns: { value: columns, configurable: true },
    rows: { value: rows, configurable: true },
  })
  return { stream, read: () => buf }
}

export async function printWelcomeTips(opts: WelcomeTipsOptions): Promise<void> {
  const cols = process.stdout.columns ?? 80
  const rows = process.stdout.rows ?? 40
  const captured = createCapturedStdout(cols, rows)

  const instance = render(<OneShot {...opts} />, {
    stdout: captured.stream,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  await instance.waitUntilExit()

  // eslint-disable-next-line no-control-regex
  const frame = captured.read().replace(/\[\?(25|2026)[hl]/g, '')
  process.stdout.write(frame)
  if (!frame.endsWith('\n')) process.stdout.write('\n')
}
