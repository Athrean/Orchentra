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
    setPermissionMode: (m) => m,
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
  test('emits a tabbed card with Status active by default and sectionsByTab populated', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([], ctx)

    expect(events).toHaveLength(1)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(ev.tabs?.items).toEqual(['Status', 'Config', 'Usage', 'Stats'])
    expect(ev.tabs?.active).toBe(0)
    expect(ev.sectionsByTab).toBeDefined()
    expect(ev.sectionsByTab?.length).toBe(4)
  })

  test.each([
    ['config', 1],
    ['usage', 2],
    ['stats', 3],
  ])('arg %s selects tab index %d', async (arg, idx) => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([arg], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    expect(ev.tabs?.active).toBe(idx)
  })

  test('Status tab includes session id, cwd, model, permission mode', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const keys = ev.sectionsByTab![0].flatMap((s) => s.rows.map((r) => r.key))
    expect(keys).toContain('Session ID')
    expect(keys).toContain('cwd')
    expect(keys).toContain('Model')
    expect(keys).toContain('Permission mode')
  })

  test('Usage tab reports token columns', async () => {
    const { ctx, events } = makeCtx()
    await new StatusCommand().execute(['usage'], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const keys = ev.sectionsByTab![2].flatMap((s) => s.rows.map((r) => r.key))
    expect(keys).toContain('Input')
    expect(keys).toContain('Output')
    expect(keys).toContain('Total')
  })
})
