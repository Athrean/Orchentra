import { describe, expect, test } from 'bun:test'
import type { SessionControl, TerseMode, UsageTotals } from '@orchentra/cli-core'
import { TerseCommand } from '../src/commands/builtin/terse'
import { createBuiltinRegistry } from '../src/commands/builtin'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function makeSession(): SessionControl {
  let terseMode: TerseMode = 'off'
  const usage: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
  return {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (mode) => mode,
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
    getTerseMode: () => terseMode,
    setTerseMode: (mode) => {
      terseMode = mode
      return terseMode
    },
  }
}

function makeCtx(session = makeSession()): { ctx: CommandContext; events: UiOutput[]; session: SessionControl } {
  const events: UiOutput[] = []
  return { session, events, ctx: { cwd: '/work', session, ui: (o) => events.push(o) } }
}

describe('TerseCommand', () => {
  test('is registered as a core slash command', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('/terse full')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((s) => s.name)).toContain('terse')
  })

  test('shows current mode with no args', async () => {
    const { ctx, events } = makeCtx()
    await new TerseCommand(() => {}).execute([], ctx)
    expect(events).toEqual([{ kind: 'note', text: 'Terse output mode: off' }])
  })

  test('sets a valid mode', async () => {
    const { ctx, events, session } = makeCtx()
    await new TerseCommand(() => {}).execute(['ultra'], ctx)
    expect(session.getTerseMode?.()).toBe('ultra')
    expect(events).toEqual([{ kind: 'note', text: 'Terse output mode set to: ultra' }])
  })

  test('rejects invalid modes', async () => {
    const { ctx, events, session } = makeCtx()
    await new TerseCommand(() => {}).execute(['tiny'], ctx)
    expect(session.getTerseMode?.()).toBe('off')
    expect(events).toEqual([
      { kind: 'note', tone: 'warn', text: 'Unknown terse mode "tiny". Use off, lite, full, or ultra.' },
    ])
  })
})
