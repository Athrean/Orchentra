import { describe, expect, test } from 'bun:test'
import type { EffortTier, SessionControl } from '@orchentra/cli-core'

import { EffortCommand } from '../../src/commands/builtin/effort'
import { createBuiltinRegistry } from '../../src/commands/builtin'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'
import { makeCommandCtx, makeSessionControl } from '../support/session'

function makeSession(initial: EffortTier = 'medium'): SessionControl {
  let effort = initial
  return makeSessionControl({
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getSessionId: () => 'session-1',
    getEffort: () => effort,
    setEffort: (next) => {
      effort = next
      return effort
    },
  })
}

function makeCtx(session = makeSession()): { ctx: CommandContext; events: UiOutput[] } {
  return makeCommandCtx(session)
}

describe('/effort slash command', () => {
  test('opens the slider picker (no arg) in TUI mode', async () => {
    const { ctx, events } = makeCtx(makeSession('high'))

    await new EffortCommand().execute([], ctx)

    expect(events).toEqual([{ kind: 'effort-picker', current: 'high' }])
  })

  test('sets low, medium, and high effort tiers', async () => {
    const session = makeSession('low')
    const { ctx, events } = makeCtx(session)

    await new EffortCommand().execute(['high'], ctx)

    expect(session.getEffort?.()).toBe('high')
    expect(events).toEqual([{ kind: 'note', text: 'Effort set to: high' }])
  })

  test('rejects unknown effort tiers without changing the session', async () => {
    const session = makeSession('medium')
    const { ctx, events } = makeCtx(session)

    await new EffortCommand().execute(['ultra'], ctx)

    expect(session.getEffort?.()).toBe('medium')
    expect(events).toEqual([
      { kind: 'note', tone: 'warn', text: 'Unknown effort "ultra". Use low, medium, high, xhigh, or max.' },
    ])
  })

  test('is registered in the builtin registry and help list', () => {
    const registry = createBuiltinRegistry()

    expect(registry.resolve('/effort high')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((spec) => spec.name)).toContain('effort')
  })
})
