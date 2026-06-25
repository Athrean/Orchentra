import { describe, expect, test } from 'bun:test'
import { CostCommand } from '../src/commands/builtin/cost'
import type { CommandContext } from '../src/commands/registry'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

function makeCtx(limits?: { maxCostUsd?: number; warnCostUsd?: number }): {
  ctx: CommandContext
  events: UiOutput[]
} {
  const events: UiOutput[] = []
  const usage: UsageTotals = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const session = {
    getModel: () => 'sonnet',
    setModel: () => 'sonnet',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: () => 'workspace-write',
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    getCostLimits: limits ? () => limits : undefined,
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
  return { events, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

describe('CostCommand', () => {
  test('shows a Budget section with the configured caps', async () => {
    const { ctx, events } = makeCtx({ maxCostUsd: 5, warnCostUsd: 1 })
    await new CostCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('Budget')
    expect(text).toContain('Hard cap')
    expect(text).toContain('Warn at')
    expect(text).toContain('$5.0000')
  })

  test('omits the Budget section when no caps are set', async () => {
    const { ctx, events } = makeCtx()
    await new CostCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(JSON.stringify(ev)).not.toContain('Budget')
  })
})
