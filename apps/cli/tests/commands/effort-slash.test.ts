import { describe, expect, test } from 'bun:test'
import type { EffortTier, SessionControl, UsageTotals } from '@orchentra/cli-core'

import { EffortCommand } from '../../src/commands/builtin/effort'
import { createBuiltinRegistry } from '../../src/commands/builtin'
import type { CommandContext } from '../../src/commands/registry'
import type { UiOutput } from '../../src/commands/ui-output'

function makeSession(initial: EffortTier = 'medium'): SessionControl {
  let effort = initial
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
    getSessionId: () => 'session-1',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
    getEffort: () => effort,
    setEffort: (next) => {
      effort = next
      return effort
    },
  }
}

function makeCtx(session = makeSession()): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return {
    events,
    ctx: { cwd: '/work', session, ui: (output) => events.push(output) },
  }
}

describe('/effort slash command', () => {
  test('shows the current effort tier', async () => {
    const { ctx, events } = makeCtx(makeSession('high'))

    await new EffortCommand().execute([], ctx)

    expect(events).toEqual([{ kind: 'note', text: 'Current effort: high' }])
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

    await new EffortCommand().execute(['max'], ctx)

    expect(session.getEffort?.()).toBe('medium')
    expect(events).toEqual([{ kind: 'note', tone: 'warn', text: 'Unknown effort "max". Use low, medium, or high.' }])
  })

  test('is registered in the builtin registry and help list', () => {
    const registry = createBuiltinRegistry()

    expect(registry.resolve('/effort high')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((spec) => spec.name)).toContain('effort')
  })
})
