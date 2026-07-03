import React from 'react'
import { render } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import { isIdeTerminal, type BannerOptions } from '../render/banner'
import { Tui } from './Tui'
import { TuiErrorBoundary } from './components/TuiErrorBoundary'

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
 * Private Ink instance fields we poke on resize. Pinning `lastOutputHeight`
 * above viewport rows guarantees Ink's `shouldClearTerminalForFrame` path
 * fires on every SIGWINCH, which triggers a full `clearTerminal` + re-emit
 * of `fullStaticOutput` (welcome banner committed via Transcript's
 * `<Static>`) + the fresh dynamic frame. Without this hook Ink's default
 * resize path only does cursor-up/erase by the stale `lastOutputHeight`,
 * which on width change leaves residual input rows stacked above the live
 * one because reflow geometry has shifted.
 *
 * The `\x1b[3J` byte that `clearTerminal` emits is dangerous in VSCode/Cursor
 * (see SCROLLBACK_ERASE) — `inkStableStdout` strips it on IDE terminals so
 * the forced clear path is safe everywhere.
 */
interface InkInstanceInternals {
  lastOutputHeight?: number
}

interface InkInstanceHandle {
  cleanup(): void
  clear(): void
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  const ide = isIdeTerminal()

  let inst: InkInstanceInternals | null = null
  const onResize = (): void => {
    if (inst) inst.lastOutputHeight = 9999
  }
  // prependListener puts us at the head of the SIGWINCH chain so the height
  // bump lands before Ink's own handler reads the field.
  process.stdout.prependListener('resize', onResize)

  const instanceRef: { current: InkInstanceHandle | null } = { current: null }
  const instance = render(
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
        clearScreen: (): void => instanceRef.current?.clear(),
      }),
    ),
    {
      stdout: inkStableStdout(ide),
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  instanceRef.current = instance

  inst = instance as unknown as InkInstanceInternals

  try {
    await instance.waitUntilExit()
  } finally {
    process.stdout.off('resize', onResize)
  }
}
