import { describe, expect, test } from 'bun:test'
import type { SessionControl, SpineBudgetControls, SpineSavings, UsageTotals } from '@orchentra/cli-core'
import { BudgetCommand } from '../src/commands/builtin/budget'
import { createBuiltinRegistry } from '../src/commands/builtin'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function makeSession(): SessionControl {
  let controls: SpineBudgetControls = {
    warnCostUsd: 1,
    maxCostUsd: 5,
    toolOutputBudgetChars: 50000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 6,
  }
  const savings: SpineSavings = {
    compactions: 2,
    compactionTokensSaved: 1234,
    toolOutputTrims: 1,
    toolOutputCharsTrimmed: 70000,
  }
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: (m) => m,
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    getSavings: () => savings,
    getContextStats: () => ({
      messages: 4,
      estimatedTokens: 8000,
      contextWindowTokens: 200000,
      compactThresholdRatio: controls.compactionThreshold,
    }),
    getBudgetControls: () => controls,
    setBudgetControls: (patch) => {
      controls = { ...controls, ...patch }
      return controls
    },
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

function makeCtx(session = makeSession()): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return { events, ctx: { cwd: '/work', session, ui: (event) => events.push(event) } }
}

describe('BudgetCommand', () => {
  test('is registered as a core slash command', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('/budget')).not.toBeInstanceOf(Error)
    expect(registry.allSpecs().map((s) => s.name)).toContain('budget')
  })

  test('shows live controls and measured savings', async () => {
    const { ctx, events } = makeCtx()
    await new BudgetCommand().execute([], ctx)
    const card = events[0]
    if (card.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(card)
    expect(text).toContain('Measured savings')
    expect(text).toContain('1,234 tokens saved')
    expect(text).toContain('70,000 chars trimmed')
  })

  test('sets tool-output cap and compaction threshold', async () => {
    const { ctx, events } = makeCtx()
    const cmd = new BudgetCommand()

    await cmd.execute(['tool-output', '25000'], ctx)
    await cmd.execute(['threshold', '0.7'], ctx)

    expect(ctx.session.getBudgetControls?.().toolOutputBudgetChars).toBe(25000)
    expect(ctx.session.getBudgetControls?.().compactionThreshold).toBe(0.7)
    expect(events).toEqual([
      { kind: 'note', text: 'Tool output cap: 25,000 chars', tone: 'info' },
      { kind: 'note', text: 'Compaction threshold: 70%', tone: 'info' },
    ])
  })

  test('queues forced compaction', async () => {
    let compacted = false
    const session = makeSession()
    session.forceCompact = () => {
      compacted = true
    }
    const { ctx, events } = makeCtx(session)

    await new BudgetCommand().execute(['compact'], ctx)

    expect(compacted).toBe(true)
    expect(events).toEqual([{ kind: 'note', text: 'Context compaction queued for the next turn.', tone: 'info' }])
  })
})
