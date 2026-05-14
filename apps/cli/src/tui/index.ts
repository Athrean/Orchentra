import React from 'react'
import { render } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import type { BannerOptions } from '../render/banner'
import { Tui } from './Tui'

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

/**
 * Wrap `process.stdout` in a Proxy whose `write` is permanently bound to the
 * original write method. captureStdio (used to collect handler stdout into
 * the transcript) replaces `process.stdout.write`; without this proxy, Ink's
 * own frame writes would also be intercepted, and the live region would
 * stop redrawing while a slash-command was running.
 *
 * Bind happens once at TUI mount, before any handler can swap the method,
 * so the proxy keeps writing to the real terminal regardless.
 */
function inkStableStdout(): NodeJS.WriteStream {
  const realWrite = process.stdout.write.bind(process.stdout)
  return new Proxy(process.stdout, {
    get(target, prop, receiver) {
      if (prop === 'write') return realWrite
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as NodeJS.WriteStream
}

/**
 * Ink internals we poke on resize. Cast is fragile to Ink's private layout
 * but is the cleanest way to force Ink's `shouldClearTerminalForFrame` path
 * to fire on every SIGWINCH. Ink's built-in handler only clears when the
 * terminal width *decreases* — on width increase (or oscillation during a
 * VSCode panel drag) it falls back to a cursor-up-erase of
 * `lastOutputHeight` lines, which is wrong at the new width and leaves
 * residual input-box rows stacked above the live one.
 *
 * Pinning `lastOutputHeight` to a value larger than viewport rows guarantees
 * `wasOverflowing === true` → full `clearTerminal` + re-emit of
 * `fullStaticOutput` (the welcome banner committed via Transcript's
 * `<Static>`) + the fresh dynamic frame. No residue, no banner loss.
 */
interface InkInstanceInternals {
  lastOutputHeight?: number
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  // Register the resize listener BEFORE Ink mounts and BEFORE Ink's own
  // listener — VSCode-integrated terminals fire several SIGWINCHs in a row
  // during a panel resize. If Ink's handler runs first it will repaint with
  // the stale (small) `lastOutputHeight`, leaving residue, before our hook
  // ever gets to bump it. `prependListener` puts us at the head of the
  // chain so the bump lands before Ink's repaint reads the field.
  let inst: InkInstanceInternals | null = null
  const onResize = (): void => {
    if (inst) inst.lastOutputHeight = 9999
  }
  process.stdout.prependListener('resize', onResize)

  const instance = render(
    React.createElement(Tui, {
      cli: opts.cli,
      registry: opts.registry,
      cwd: opts.cwd,
      model: opts.model,
      mode: opts.mode,
      branch: opts.branch,
      banner: opts.banner,
    }),
    {
      stdout: inkStableStdout(),
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )

  inst = instance as unknown as InkInstanceInternals

  try {
    await instance.waitUntilExit()
  } finally {
    process.stdout.off('resize', onResize)
  }
}
