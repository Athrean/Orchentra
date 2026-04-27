import { EventEmitter } from 'node:events'
import { homedir, userInfo } from 'node:os'
import React from 'react'
import { Box, render, Text, useApp, useStdout } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
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

// Brand green (matches the mascot). Hex is what ink/chalk want.
const BRAND = '#3dd699'

// Widths, in terminal cells. These are *targets* — Yoga enforces them via
// flexBasis / width props rather than manual arithmetic.
const LEFT_COL_WIDTH = 34
const RIGHT_COL_MIN = 28
// Terminal width (outer) at which we show the right-hand "tips" column.
// Below this, the banner collapses to a single column automatically.
const TWO_COL_MIN_COLS = LEFT_COL_WIDTH + RIGHT_COL_MIN + 10

/**
 * React/Ink component for the welcome banner. Layout is handled by Yoga
 * (flex-box), so width math is not our job — we just declare intent.
 */
export function WelcomeBanner(props: BannerOptions): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80
  const twoCol = cols >= TWO_COL_MIN_COLS

  const colorMode = detectColorMode()
  const mascotLines = renderMascot(colorMode)
  const name = displayName()
  const title = `${capitalize(props.cliName)} v${props.cliVersion}`
  const providerLine = `${props.providerName ?? 'anthropic'} · ${props.permissionMode}`
  const cwdLine = prettyCwd(props.cwd)
  const statusText = [props.branch, props.workspaceStatus].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingLeft={1} paddingBottom={1}>
        <Text bold color={BRAND}>
          {title}
        </Text>
      </Box>

      <Box borderStyle="round" borderColor={BRAND} flexDirection={twoCol ? 'row' : 'column'} paddingX={2} paddingY={0}>
        <LeftColumn
          welcome={`Welcome back ${name}!`}
          mascotLines={mascotLines}
          model={props.model}
          provider={providerLine}
          cwd={cwdLine}
          fixedWidth={twoCol ? LEFT_COL_WIDTH : undefined}
        />

        {twoCol ? <RightColumn sessionId={props.sessionId} /> : null}
      </Box>

      {statusText.length > 0 ? (
        <Box justifyContent="space-between" paddingX={1} paddingTop={0}>
          <Text dimColor>{statusText}</Text>
          <Text dimColor>{props.model}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

interface LeftColumnProps {
  readonly welcome: string
  readonly mascotLines: readonly string[]
  readonly model: string
  readonly provider: string
  readonly cwd: string
  readonly fixedWidth?: number
}

function LeftColumn(props: LeftColumnProps): React.ReactElement {
  const widthProps = props.fixedWidth !== undefined ? { width: props.fixedWidth, flexShrink: 0 as const } : {}
  return (
    <Box flexDirection="column" {...widthProps}>
      <Box height={1} />
      <Text bold>{props.welcome}</Text>
      <Box height={1} />
      {props.mascotLines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Box height={1} />
      <Text dimColor>{props.model}</Text>
      <Text dimColor>{props.provider}</Text>
      <Text dimColor>{props.cwd}</Text>
    </Box>
  )
}

interface RightColumnProps {
  readonly sessionId?: string
}

function RightColumn(props: RightColumnProps): React.ReactElement {
  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      flexShrink={1}
      borderStyle="single"
      borderColor={BRAND}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      paddingLeft={2}
    >
      <Box flexDirection="column" flexGrow={1}>
        <Box height={1} />
        <Text bold>Tips for getting started</Text>
        <Text>
          <Text dimColor>Run </Text>
          <Text bold>/help</Text>
          <Text dimColor> for commands</Text>
        </Text>
        <Text>
          <Text dimColor>Run </Text>
          <Text bold>/login</Text>
          <Text dimColor> to connect providers</Text>
        </Text>
        <Box height={1} />
        <Text bold>Recent activity</Text>
        <Text dimColor>{props.sessionId ? `Session ${props.sessionId.slice(0, 12)}` : 'No recent activity'}</Text>
      </Box>
    </Box>
  )
}

/**
 * Tiny wrapper component: mounts the banner, then calls `exit()` on its first
 * effect so `render().waitUntilExit()` resolves after the frame has been
 * committed. Without this, we'd race Ink's throttled log-update and lose the
 * top/bottom borders.
 */
function OneShotBanner(props: BannerOptions): React.ReactElement {
  const { exit } = useApp()
  React.useEffect(() => {
    // Schedule exit on the next tick so the frame fully commits first.
    const timer = setTimeout(exit, 0)
    return () => clearTimeout(timer)
  }, [exit])
  return <WelcomeBanner {...props} />
}

interface CapturedStdout {
  readonly stream: NodeJS.WriteStream
  readonly read: () => string
}

/**
 * A minimal `NodeJS.WriteStream` stand-in that accumulates writes in memory.
 * Ink only needs `write()`, `isTTY`, `columns`, and `rows` on the stream; by
 * mocking those we can render off-terminal and then splat the result to the
 * real stdout as a single print — no cursor juggling, no torn frames.
 */
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

/**
 * Renders the banner once and prints it to stdout. Layout is computed by
 * Yoga against the real terminal width, but the output is captured to an
 * in-memory stream first and then written atomically — this avoids the
 * log-update cursor machinery Ink uses for interactive rendering, which
 * was clipping the top/bottom borders when we unmounted quickly.
 */
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

  // Strip the cursor show/hide + synchronized-update escapes that Ink emits
  // around frames — they're meaningful for live rendering but noise for a
  // one-shot print.
  // eslint-disable-next-line no-control-regex
  const frame = captured.read().replace(/\u001b\[\?(25|2026)[hl]/g, '')
  process.stdout.write(frame)
  if (!frame.endsWith('\n')) process.stdout.write('\n')
}

// -------------------- small utilities --------------------

function displayName(): string {
  try {
    const u = userInfo().username
    if (u && u.length > 0) return u
  } catch {
    // fall through
  }
  return 'friend'
}

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
