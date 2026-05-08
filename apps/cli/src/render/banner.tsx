import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import React from 'react'
import { Box, render, Text, useApp, useStdout } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import { detectColorMode } from './ansi'
import { renderMascot } from './mascot'
import { THEME } from '../tui/theme'

export interface BannerOptions {
  readonly cliName: string
  readonly cliVersion: string
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
  readonly branch?: string
  readonly workspaceStatus?: string
  readonly sessionId?: string
  readonly sessionPath?: string
  readonly providerName?: string
  readonly username?: string
}

const TIPS: ReadonlyArray<readonly [string, string]> = [
  ['/help', 'list every command grouped by category'],
  ['/triage', 'debug a failing GitHub Actions run in one slash'],
  ['/clean', 'prune old workflow runs and expired artifacts'],
  ['/login', 'connect Anthropic, OpenAI, or Gemini providers'],
]

const BOX_MAX_WIDTH = 110
const MASCOT_MIN_COLS = 60

export function WelcomeBanner(props: BannerOptions): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const showMascot = cols >= MASCOT_MIN_COLS

  const provider = props.providerName ?? 'anthropic'
  const cwd = prettyCwd(props.cwd)
  const username = props.username ?? process.env.USER ?? 'there'
  const mascotLines = showMascot ? renderMascot(detectColorMode()) : []

  const boxWidth = Math.min(cols - 2, BOX_MAX_WIDTH)
  const titleLabel = ` ${capitalize(props.cliName)} v${props.cliVersion} `
  const dashesAfterTitle = Math.max(boxWidth - titleLabel.length - 3, 0)
  const topBorder = `╭─${titleLabel}${'─'.repeat(dashesAfterTitle)}╮`

  return (
    <Box flexDirection="column" width={boxWidth}>
      <Text color={THEME.brand}>{topBorder}</Text>
      <Box
        borderStyle="round"
        borderTop={false}
        borderColor={THEME.brand}
        flexDirection="row"
        paddingX={2}
        paddingY={1}
      >
        <Box flexDirection="column" alignItems="center" marginRight={4} flexGrow={1}>
          <Text bold>{`Welcome back, ${username}!`}</Text>
          {showMascot ? (
            <Box flexDirection="column" paddingY={1}>
              {mascotLines.map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
            </Box>
          ) : (
            <Box height={1} />
          )}
          <Text dimColor>{`${props.model} · ${provider}`}</Text>
          <Text dimColor>{cwd}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <Text color={THEME.brand} bold>
            Tips for getting started
          </Text>
          <Box height={1} />
          {TIPS.map(([key, label], i) => (
            <Box key={key} flexDirection="row">
              <Text color={THEME.brand}>{`${i + 1}. `}</Text>
              <Text bold>{key}</Text>
              <Text dimColor>{`  ${label}`}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

function OneShotBanner(props: BannerOptions): React.ReactElement {
  const { exit } = useApp()
  React.useEffect(() => {
    const t = setTimeout(exit, 0)
    return () => clearTimeout(t)
  }, [exit])
  return <WelcomeBanner {...props} />
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

export async function printWelcomeBanner(opts: BannerOptions): Promise<void> {
  const cols = process.stdout.columns ?? 80
  const rows = process.stdout.rows ?? 40
  const captured = createCapturedStdout(cols, rows)

  const instance = render(<OneShotBanner {...opts} />, {
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

export { useStdout }

function capitalize(value: string): string {
  if (value.length === 0) return value
  return value[0].toUpperCase() + value.slice(1)
}

function prettyCwd(cwd: string): string {
  const home = homedir()
  if (home && cwd === home) return '~'
  if (home && cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`
  return cwd
}
