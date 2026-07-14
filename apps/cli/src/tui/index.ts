import React from 'react'
import { render } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import { isIdeTerminal, type BannerOptions } from '../render/banner'
import { Tui } from './Tui'
import { TuiErrorBoundary } from './components/TuiErrorBoundary'
import { setActiveTheme } from './theme'
import { loadActiveTheme } from './theme-registry'

export interface RunTuiOptions {
  readonly cli: LiveCli
  readonly registry: CommandRegistry
  readonly cwd: string
  readonly model: string
  readonly mode: PermissionMode
  readonly branch?: string
  /**
   * Welcome banner props. Banner renders as the first live child of the Ink
   * tree so it reflows naturally when the terminal resizes, instead of being
   * stamped into scrollback at the original column width.
   */
  readonly banner?: BannerOptions
}

const ERASE_VIEWPORT = '\x1b[2J\x1b[H'

// Ink's `clearTerminal` writes the byte sequence `\x1b[2J\x1b[3J\x1b[H`
// (erase display + erase scrollback + cursor home). VSCode/Cursor integrated
// terminals do not honor `\x1b[3J` — instead of wiping scrollback they shove
// the prior frame *into* it, so a SIGWINCH burst during a panel drag piles
// up phantom input rows. Stripping the scrollback-erase from outgoing writes
// neutralizes that path while keeping the viewport clear (`\x1b[2J\x1b[H`)
// working as intended on VSCode + Cursor.
// eslint-disable-next-line no-control-regex
const SCROLLBACK_ERASE = /\x1b\[3J/g

/**
 * Wrap `process.stdout` in a Proxy whose `write` is permanently bound to the
 * original write method. captureStdio (used to collect handler stdout into
 * the transcript) replaces `process.stdout.write`; without this proxy, Ink's
 * own frame writes would also be intercepted, and the live region would
 * stop redrawing while a slash-command was running.
 *
 * Bind happens once at TUI mount, before any handler can swap the method,
 * so the proxy keeps writing to the real terminal regardless.
 *
 * When `stripScrollbackErase` is true, any `\x1b[3J` byte sequence is
 * filtered out before reaching the real stdout. See SCROLLBACK_ERASE.
 */
function inkStableStdout(stripScrollbackErase: boolean): NodeJS.WriteStream {
  const realWrite = process.stdout.write.bind(process.stdout)
  const write = stripScrollbackErase
    ? (chunk: unknown, ...rest: unknown[]): boolean => {
        if (typeof chunk === 'string') {
          return (realWrite as (c: string, ...r: unknown[]) => boolean)(chunk.replace(SCROLLBACK_ERASE, ''), ...rest)
        }
        if (Buffer.isBuffer(chunk)) {
          const cleaned = chunk.toString('utf8').replace(SCROLLBACK_ERASE, '')
          return (realWrite as (c: string, ...r: unknown[]) => boolean)(cleaned, ...rest)
        }
        return (realWrite as (c: unknown, ...r: unknown[]) => boolean)(chunk, ...rest)
      }
    : realWrite
  return new Proxy(process.stdout, {
    get(target, prop, receiver) {
      if (prop === 'write') return write
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as NodeJS.WriteStream
}

/**
 * Public Ink render handle. The internal Ink instance owns resize bookkeeping
 * such as `lastOutputHeight`, but `render()` intentionally returns only this
 * facade. Keep resize recovery on the public `clear`/`rerender` surface.
 */
interface InkInstanceHandle {
  cleanup(): void
  clear(): void
  rerender(node: React.ReactNode): void
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  // Apply the persisted theme before the first render so a non-dark choice
  // (e.g. high-contrast, solarized) actually styles the session — not just
  // the picker preview.
  setActiveTheme(loadActiveTheme())

  const ide = isIdeTerminal()

  const instanceRef: { current: InkInstanceHandle | null } = { current: null }
  let renderedNode: React.ReactNode | null = null
  let resizeGeneration = 0
  let lastColumns = process.stdout.columns ?? 80
  let lastRows = process.stdout.rows ?? 24
  let resizeQueued = false

  const createNode = (): React.ReactNode =>
    React.createElement(
      TuiErrorBoundary,
      {
        sessionId: opts.cli.getSessionId(),
        onCleanup: (): void => instanceRef.current?.cleanup(),
      },
      React.createElement(Tui, {
        cli: opts.cli,
        registry: opts.registry,
        cwd: opts.cwd,
        model: opts.model,
        mode: opts.mode,
        branch: opts.branch,
        banner: opts.banner,
        clearScreen: (): void => {
          process.stdout.write(ERASE_VIEWPORT)
          instanceRef.current?.clear()
        },
        resizeGeneration,
      }),
    )

  const onResize = (): void => {
    const columns = process.stdout.columns ?? 80
    const rows = process.stdout.rows ?? 24
    if (columns === lastColumns && rows === lastRows) return
    lastColumns = columns
    lastRows = rows
    if (resizeQueued) return
    resizeQueued = true
    queueMicrotask(() => {
      resizeQueued = false
      if (!instanceRef.current || renderedNode === null) return
      resizeGeneration += 1
      renderedNode = createNode()
      process.stdout.write(ERASE_VIEWPORT)
      instanceRef.current.clear()
      instanceRef.current.rerender(renderedNode)
    })
  }
  // Let Ink process its resize first, then repaint from a clean viewport in a
  // microtask. This avoids stale wrapped rows when the live input/footer height
  // changes during a side-by-side terminal drag.
  process.stdout.prependListener('resize', onResize)

  renderedNode = createNode()

  const instance = render(renderedNode, {
    stdout: inkStableStdout(ide),
    exitOnCtrlC: false,
    patchConsole: false,
  })
  instanceRef.current = instance

  try {
    await instance.waitUntilExit()
  } finally {
    process.stdout.off('resize', onResize)
  }
}
