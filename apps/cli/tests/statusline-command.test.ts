import { describe, expect, test } from 'bun:test'
import type { SessionControl } from '@orchentra/cli-core'
import { StatuslineCommand } from '../src/commands/builtin/terminal-parity'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function session(): SessionControl {
  return {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: (m) => m,
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }),
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

describe('StatuslineCommand', () => {
  test('opens the interactive TUI configurator when a ui sink is available', async () => {
    const events: UiOutput[] = []
    const ctx: CommandContext = { cwd: '/work', session: session(), ui: (event) => events.push(event) }

    await new StatuslineCommand().execute([], ctx)

    expect(events).toEqual([{ kind: 'statusline-config' }])
  })

  test('falls back to a card outside the TUI', async () => {
    const events: UiOutput[] = []
    const ctx: CommandContext = { cwd: '/work', session: session(), ui: (event) => events.push(event) }
    delete (ctx as { ui?: unknown }).ui

    await new StatuslineCommand().execute([], ctx)

    expect(events).toHaveLength(0)
  })
})
