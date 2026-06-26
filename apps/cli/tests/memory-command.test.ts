import { describe, expect, test } from 'bun:test'
import { MemoryCommand, ForgetCommand } from '../src/commands/builtin/memory'
import type { CommandContext } from '../src/commands/registry'
import type { MemoryStore, PatternEntry, SessionControl, UsageTotals } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

function makeEntry(over: Partial<PatternEntry> = {}): PatternEntry {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    orgId: 'default',
    incidentId: null,
    embedding: [],
    pattern: 'flaky network test on CI runner',
    resolution: 'add retry with backoff to the fetch helper',
    failureType: 'flaky_test',
    usageCount: 3,
    lastMatchedAt: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    ...over,
  }
}

class FakeStore implements MemoryStore {
  constructor(public entries: PatternEntry[] = []) {}
  save(_org: string, e: PatternEntry): void {
    this.entries.push(e)
  }
  load(_org: string): PatternEntry[] {
    return this.entries
  }
  updateUsage(): void {}
  updateUsageBatch(): void {}
  setFeedback(_org: string, id: string, feedback: 'accepted' | 'rejected', at = new Date()): void {
    this.entries = this.entries.map((entry) =>
      entry.id === id ? { ...entry, feedback, feedbackAt: at.toISOString() } : entry,
    )
  }
  delete(_org: string, id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id)
  }
  has(_org: string, incidentId: string): boolean {
    return this.entries.some((e) => e.incidentId === incidentId)
  }
}

function makeCtx(): { ctx: CommandContext; events: UiOutput[] } {
  const events: UiOutput[] = []
  const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const session = {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'workspace-write',
    setPermissionMode: () => 'workspace-write',
    getSessionId: () => 's',
    getTurns: () => 0,
    getUsage: () => usage,
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
  return { events, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

describe('MemoryCommand', () => {
  test('list with no memories reports an empty store', async () => {
    const { ctx, events } = makeCtx()
    await new MemoryCommand(new FakeStore()).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('no memories')
  })

  test('list shows id prefix, failure type, created date, and pattern snippet', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('11111111') // short id prefix
    expect(text).toContain('flaky_test')
    expect(text).toContain('2026-06-20')
    expect(text).toContain('flaky network test')
  })

  test('show <id-prefix> displays pattern and resolution', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute(['show', '11111111'], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected card')
    const text = JSON.stringify(ev)
    expect(text).toContain('flaky network test on CI runner')
    expect(text).toContain('add retry with backoff')
  })

  test('show with unknown id reports not found without throwing', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute(['show', 'deadbeef'], ctx)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('no memory')
  })

  test('show with an ambiguous prefix reports the ambiguity', async () => {
    const store = new FakeStore([
      makeEntry({ id: 'aaaa1111-0000-0000-0000-000000000000' }),
      makeEntry({ id: 'aaaa2222-0000-0000-0000-000000000000' }),
    ])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute(['show', 'aaaa'], ctx)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('ambiguous')
  })

  test('show with no id reports usage', async () => {
    const { ctx, events } = makeCtx()
    await new MemoryCommand(new FakeStore([makeEntry()])).execute(['show'], ctx)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('/memory show')
  })

  test('mark <id> accepted persists feedback and confirms', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute(['mark', '11111111', 'accepted'], ctx)
    expect(store.entries[0].feedback).toBe('accepted')
    expect(store.entries[0].feedbackAt).toBeTruthy()
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('accepted')
  })

  test('mark rejects unknown feedback values', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new MemoryCommand(store).execute(['mark', '11111111', 'maybe'], ctx)
    expect(store.entries[0].feedback).toBeUndefined()
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('accepted|rejected')
  })
})

describe('ForgetCommand', () => {
  test('forget <id-prefix> deletes the entry and confirms', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new ForgetCommand(store).execute(['11111111'], ctx)
    expect(store.entries).toHaveLength(0)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('forgot')
  })

  test('forget with unknown id does not delete and reports not found', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new ForgetCommand(store).execute(['deadbeef'], ctx)
    expect(store.entries).toHaveLength(1)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text.toLowerCase()).toContain('no memory')
  })

  test('forget with no id reports usage', async () => {
    const store = new FakeStore([makeEntry()])
    const { ctx, events } = makeCtx()
    await new ForgetCommand(store).execute([], ctx)
    expect(store.entries).toHaveLength(1)
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('/forget')
  })
})
