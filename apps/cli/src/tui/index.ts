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

export async function runTui(opts: RunTuiOptions): Promise<void> {
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

  await instance.waitUntilExit()
}
