import { describe, expect, test } from 'bun:test'
import { StatusCommand } from '../src/commands/builtin/status'
import type { CommandContext } from '../src/commands/registry'
import type { SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

function makeSession(): SessionControl {
  const usage: UsageTotals = {
    inputTokens: 1234,
    outputTokens: 567,
    cacheReadTokens: 99,
    cacheCreationTokens: 12,
  }
  return {
    getModel: () => 'claude-sonnet-4-20250514',
    setModel: () => 'claude-sonnet-4-20250514',
    getPermissionMode: () => 'workspace-write',
    getSessionId: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    getTurns: () => 7,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
  }
}

function makeCtx(): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  return {
    events,
    ctx: { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) },
  }
}

describe('StatusCommand', () => {
  test('emits a card with all 4 tabs and Account active by default', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([], ctx)

    expect(events).toHaveLength(1)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(ev.tabs?.items).toEqual(['Account', 'Config', 'Usage', 'Stats'])
    expect(ev.tabs?.active).toBe(0)
    expect(ev.title).toBe('Status — Account')
  })

  test.each([
    ['config', 1, 'Config'],
    ['usage', 2, 'Usage'],
    ['stats', 3, 'Stats'],
  ])('arg %s selects tab index %d', async (arg, idx, label) => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([arg], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(ev.tabs?.active).toBe(idx)
    expect(ev.title).toContain(label)
  })

  test('Account section includes session and cwd', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const keys = ev.sections.flatMap((s) => s.rows.map((r) => r.key))
    expect(keys).toContain('Session')
    expect(keys).toContain('CWD')
  })

  test('Usage tab reports token columns', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute(['usage'], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const keys = ev.sections.flatMap((s) => s.rows.map((r) => r.key))
    expect(keys).toContain('Input tokens')
    expect(keys).toContain('Output tokens')
    expect(keys).toContain('Total')
  })
})
