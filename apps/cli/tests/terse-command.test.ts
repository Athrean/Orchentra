import { describe, expect, test } from 'bun:test'
import type { SessionControl, TerseMode } from '@orchentra/cli-core'
import { TerseCommand } from '../src/commands/builtin/terse'
import { createBuiltinRegistry } from '../src/commands/builtin'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'
import { makeCommandCtx, makeSessionControl } from './support/session'

function makeSession(): SessionControl {
  let terseMode: TerseMode = 'off'
  return makeSessionControl({
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getTerseMode: () => terseMode,
    setTerseMode: (mode) => {
      terseMode = mode
      return terseMode
    },
  })
}

function makeCtx(session = makeSession()): { ctx: CommandContext; events: UiOutput[]; session: SessionControl } {
  return makeCommandCtx(session)
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
