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
    }),
    {
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  await instance.waitUntilExit()
}
