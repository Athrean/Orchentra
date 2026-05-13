import React from 'react'
import { render } from 'ink'
import type { PermissionMode } from '@orchentra/cli-core'
import type { LiveCli } from '../live-cli'
import type { CommandRegistry } from '../commands/builtin'
import { Tui } from './Tui'

export interface RunTuiOptions {
  readonly cli: LiveCli
  readonly registry: CommandRegistry
  readonly cwd: string
  readonly model: string
  readonly mode: PermissionMode
  readonly branch?: string
  /**
   * Pre-rendered welcome banner string. Stashed inside Ink's
   * `fullStaticOutput` so that the resize-driven `clearTerminal` re-emits the
   * banner above the transcript scrollback, instead of wiping it.
   */
  readonly bannerFrame?: string
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
 * Ink internals we poke on resize. The cast is fragile to Ink's private
 * layout but is the only way to (a) tell Ink the previous frame "overflowed"
 * — which forces its built-in `shouldClearTerminalForFrame` path to fire and
 * issue a full screen clear — and (b) stash the welcome banner in the static
 * region so that clear gets followed by a banner re-emit.
 */
interface InkInstanceInternals {
  lastOutput?: string
  lastOutputToRender?: string
  lastOutputHeight?: number
  fullStaticOutput?: string
}

export async function runTui(opts: RunTuiOptions): Promise<void> {
  // Register the resize listener BEFORE we mount Ink. VSCode-integrated
  // terminals fire several SIGWINCH events while the panel finalizes its
  // size; if we wait until after `render()` returns to attach the listener,
  // those early events trigger Ink's own resize handler (which renders a
  // fresh frame at slightly different `cols`) without our overflow-forge
  // running first, and the input box stacks visibly before the user has
  // typed anything. Using a closure for the instance reference lets us
  // register the listener immediately and resolve the instance lazily.
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
    }),
    {
      stdout: inkStableStdout(),
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )

  inst = instance as unknown as InkInstanceInternals

  // Inject the captured banner into Ink's fullStaticOutput so that on the
  // next clearTerminal-driven render Ink writes the sequence
  //   clearTerminal + bannerFrame + transcript-static + liveOutput
  // and the banner stays anchored at the top of the scrollback. We seed it
  // after mount because Ink resets fullStaticOutput to '' during construction.
  if (opts.bannerFrame) {
    inst.fullStaticOutput = (inst.fullStaticOutput ?? '') + opts.bannerFrame
  }

  try {
    await instance.waitUntilExit()
  } finally {
    process.stdout.off('resize', onResize)
  }
}
