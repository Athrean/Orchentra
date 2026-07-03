import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import React from 'react'
import { Box, render, Text, useApp, useStdout } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import { THEME } from '../tui/theme'
import { humanizeModelId } from '../model-catalog'

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
  /**
   * Force the full bordered welcome card with tips even
   * when running in an IDE-integrated terminal. Used by the first-run
   * sign-in screen so the user sees the full Orchentra UX before
   * configuring credentials, instead of the IDE-compact fallback.
   */
  readonly forceBordered?: boolean
}

const TIPS: ReadonlyArray<readonly [string, string]> = [
  ['/help', 'list commands grouped by category'],
  ['/status', 'inspect session, config, usage, and stats'],
  ['/skills', 'show loaded workspace skills'],
  ['/review', 'verify changes by running real checks'],
]

const BOX_MAX_WIDTH = 110
const BOX_MIN_WIDTH = 24
const TIPS_BREAKPOINT = 80
const COLUMN_GAP = 4

const SMALL_MASCOT_LINES = ['  ▄██▄  ', '▄█ ▄▄ █▄', '▀█▄▄▄▄█▀'] as const

const COMPACT_MASCOT_LINES = [
  '   ▄▄██▀▀██▄▄',
  ' ▄█▀   ▄▄   ▀█▄',
  '▄█ ▄█▀▀▀▀▀█▄  █▄',
  '███▀ ▄▄▄▄▄▄█▄ ▀█',
  '██  █▀    ▀██  █',
  '█  ██▄    ▄█  ██',
  '█▄ ██▀▀██▀▀ ▄███',
  '▀█  ▀▄▄▄▄▄▄█▀ █▀',
  ' ▀█▄  ▀▀▀▀  ▄█▀',
  '   ▀▀██▄▄██▀▀',
] as const

const FULL_MASCOT_LINES = [
  '      ▄▄▄██████▄▄▄',
  '    ▄██▀▀      ▀▀██▄',
  '  ▄██▀   ▄▄▄▄▄    ▀██▄',
  ' ██▀ ▄▄██▀▀▀▀▀██▄   ▀██',
  '▄█▀▄██▀         ██▄  ▀█▄',
  '████▀   ▄██████▄ ██   ██',
  '███   ▄█▀▀     ▀███   ██',
  '██   ██          ██   ██',
  '██   ███▄      ▄██   ███',
  '██   ██▀███▄▄███▀  ▄████',
  '▀█▄  ▀█▄         ▄██▀▄█▀',
  ' ██▄  ▀██▄▄▄▄▄▄███▀ ▄██',
  '  ▀██▄   ▀▀▀▀▀▀▀  ▄██▀',
  '    ▀██▄▄      ▄▄██▀',
  '      ▀▀▀██████▀▀▀',
] as const

type MascotSize = 'small' | 'compact' | 'full'

function maxLineWidth(lines: readonly string[]): number {
  return Math.max(...lines.map((line) => line.length))
}

const COMPACT_MASCOT_WIDTH = maxLineWidth(COMPACT_MASCOT_LINES)
const FULL_MASCOT_WIDTH = maxLineWidth(FULL_MASCOT_LINES)
const SMALL_MASCOT_WIDTH = maxLineWidth(SMALL_MASCOT_LINES)

function mascotLines(size: MascotSize): readonly string[] {
  if (size === 'small') return SMALL_MASCOT_LINES
  return size === 'full' ? FULL_MASCOT_LINES : COMPACT_MASCOT_LINES
}

function mascotWidth(size: MascotSize): number {
  if (size === 'small') return SMALL_MASCOT_WIDTH
  return size === 'full' ? FULL_MASCOT_WIDTH : COMPACT_MASCOT_WIDTH
}

/**
 * Detect when we're running inside an IDE-integrated terminal where line
 * spacing is tight and the host UI already provides framing. In that case we
 * skip the bordered card and render the banner as a compact meta row,
 * matching how Claude Code presents itself in VSCode/Cursor terminals.
 */
export function isIdeTerminal(): boolean {
  const term = (process.env.TERM_PROGRAM ?? '').toLowerCase()
  return term === 'vscode' || term === 'cursor'
}

export function WelcomeBanner(props: BannerOptions): React.ReactElement {
  if (isIdeTerminal() && !props.forceBordered) return <IdeCompactBanner {...props} />
  return <BorderedBanner {...props} />
}

function IdeCompactBanner(props: BannerOptions): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80

  const provider = props.providerName ?? 'anthropic'
  const cwd = prettyCwd(props.cwd)
  const infoMaxWidth = Math.max(8, cols - 2)

  const titleLine = `${capitalize(props.cliName)} v${props.cliVersion}`
  const metaLine = `${humanizeModelId(props.model)} · ${provider}`
  const markWidth = mascotWidth('small')
  const lines = mascotLines('small')

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} width={infoMaxWidth}>
      {lines.map((line, index) => (
        <Box key={`${index}:${line}`} flexDirection="row" width={infoMaxWidth}>
          <Text color={THEME.brand}>{line.padEnd(markWidth)}</Text>
          {index === 0 ? (
            <>
              <Text>{'  '}</Text>
              <Text bold color={THEME.brand} wrap="truncate-end">
                {titleLine}
              </Text>
            </>
          ) : null}
          {index === 1 ? (
            <>
              <Text>{'  '}</Text>
              <Text dimColor wrap="truncate-end">
                {metaLine}
              </Text>
            </>
          ) : null}
          {index === 2 ? (
            <>
              <Text>{'  '}</Text>
              <Text dimColor wrap="truncate-end">
                {cwd}
              </Text>
            </>
          ) : null}
        </Box>
      ))}
    </Box>
  )
}

function BorderedBanner(props: BannerOptions): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout?.columns ?? 80

  const provider = props.providerName ?? 'anthropic'
  const cwd = prettyCwd(props.cwd)
  const username = props.username ?? process.env.USER ?? 'there'

  const boxWidth = Math.max(BOX_MIN_WIDTH, Math.min(cols - 2, BOX_MAX_WIDTH))
  const innerWidth = Math.max(boxWidth - 6, 8)

  const showTips = cols >= TIPS_BREAKPOINT

  const titleLabel = ` ${capitalize(props.cliName)} v${props.cliVersion} `
  const dashesAfterTitle = Math.max(boxWidth - titleLabel.length - 3, 0)
  const topBorder = `╭─${titleLabel}${'─'.repeat(dashesAfterTitle)}╮`

  const meta = `${humanizeModelId(props.model)} · ${provider}`

  if (!showTips) {
    return (
      <Box flexDirection="column" width={boxWidth}>
        <Text color={THEME.brand}>{topBorder}</Text>
        <Box
          borderStyle="round"
          borderTop={false}
          borderColor={THEME.brand}
          flexDirection="column"
          alignItems="center"
          paddingX={2}
          paddingY={1}
          width={boxWidth}
        >
          <MascotMark size="compact" />
          <Box height={1} />
          <Box width={innerWidth} justifyContent="center">
            <Text bold wrap="truncate-end">{`Welcome back, ${username}!`}</Text>
          </Box>
          <Box height={1} />
          <Box width={innerWidth} justifyContent="center">
            <Text dimColor wrap="truncate-end">
              {meta}
            </Text>
          </Box>
          <Box width={innerWidth} justifyContent="center">
            <Text dimColor wrap="truncate-end">
              {cwd}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  }

  const mascotSize: MascotSize = 'full'
  const leftWidth = Math.max(24, mascotWidth(mascotSize), Math.floor(innerWidth * 0.4))
  const rightWidth = Math.max(innerWidth - leftWidth - COLUMN_GAP, 20)

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
        width={boxWidth}
      >
        <Box flexDirection="column" alignItems="center" width={leftWidth}>
          <MascotMark size={mascotSize} />
          <Box height={1} />
          <Box width={leftWidth} justifyContent="center">
            <Text bold wrap="truncate-end">{`Welcome back, ${username}!`}</Text>
          </Box>
          <Box height={1} />
          <Box width={leftWidth} justifyContent="center">
            <Text dimColor wrap="truncate-end">
              {meta}
            </Text>
          </Box>
          <Box width={leftWidth} justifyContent="center">
            <Text dimColor wrap="truncate-end">
              {cwd}
            </Text>
          </Box>
        </Box>
        <Box width={COLUMN_GAP} />
        <Box flexDirection="column" width={rightWidth}>
          <Box width={rightWidth}>
            <Text color={THEME.brand} bold wrap="truncate-end">
              Tips for getting started
            </Text>
          </Box>
          <Box height={1} />
          {TIPS.map(([key, label], i) => {
            const prefix = `${i + 1}. `
            const consumed = prefix.length + key.length + 2
            const avail = Math.max(0, rightWidth - consumed)
            const labelTrunc = label.length > avail ? `${label.slice(0, Math.max(0, avail - 1))}…` : label
            return (
              <Box key={key} flexDirection="row" width={rightWidth}>
                <Text color={THEME.brand}>{prefix}</Text>
                <Text bold>{key}</Text>
                <Text dimColor>{`  ${labelTrunc}`}</Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}

function MascotMark({ size = 'compact' }: { readonly size?: MascotSize }): React.ReactElement {
  const lines = mascotLines(size)
  const width = mascotWidth(size)

  return (
    <Box flexDirection="column" width={width}>
      {lines.map((line, index) => (
        <Text key={`${index}:${line}`} color={THEME.brand}>
          {line.padEnd(width)}
        </Text>
      ))}
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

/**
 * Render the welcome banner to a string without writing to stdout. Exposed
 * separately from {@link printWelcomeBanner} so the TUI can stash the frame
 * inside Ink's `fullStaticOutput`, ensuring resize-driven `clearTerminal`
 * writes re-emit the banner instead of leaving it scrolled away.
 */
export async function renderBannerFrame(opts: BannerOptions): Promise<string> {
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
  return frame.endsWith('\n') ? frame : `${frame}\n`
}

export async function printWelcomeBanner(opts: BannerOptions): Promise<void> {
  const frame = await renderBannerFrame(opts)
  process.stdout.write(frame)
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
