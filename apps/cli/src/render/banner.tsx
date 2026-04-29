import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import React from 'react'
import { Box, render, Text, useApp, useStdout } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import { THEME, modeAccent } from '../tui/theme'
import { detectColorMode } from './ansi'
import { renderMascot } from './mascot'

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
}

const TIP_LINE = `${THEME.bullet} /help  ${THEME.bullet} /login  ${THEME.bullet} /incidents  ${THEME.bullet} /triage <id>`
const MASCOT_MIN_COLS = 60

export function WelcomeBanner(props: BannerOptions): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const showMascot = cols >= MASCOT_MIN_COLS

  const title = `Welcome to ${capitalize(props.cliName)} v${props.cliVersion}`
  const provider = props.providerName ?? 'anthropic'
  const cwd = prettyCwd(props.cwd)
  const where = [cwd, props.branch, props.workspaceStatus].filter(Boolean).join(`  ${THEME.bullet}  `)
  const session = props.sessionId ? `session ${props.sessionId.slice(0, 12)}` : null
  const meta = [session, props.model, `${provider} · ${props.permissionMode}`]
    .filter(Boolean)
    .join(`  ${THEME.bullet}  `)

  const mascotLines = showMascot ? renderMascot(detectColorMode()) : []

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" paddingX={1} marginBottom={1}>
        <Text bold>{title}</Text>
        <Box flexGrow={1} />
        <Text color={modeAccent(props.permissionMode)}>{props.permissionMode}</Text>
      </Box>
      {showMascot ? (
        <Box flexDirection="column" paddingX={1}>
          {mascotLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      ) : null}
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text>Let&apos;s get started.</Text>
        <Text dimColor>{TIP_LINE}</Text>
        <Text dimColor>{where}</Text>
        {meta.length > 0 ? <Text dimColor>{meta}</Text> : null}
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
