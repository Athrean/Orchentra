import { describe, expect, test } from 'bun:test'
import { RewindCommand } from '../src/commands/builtin/terminal-parity'
import type { CommandContext } from '../src/commands/registry'
import type { RewindResult, SessionControl } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

function makeCtx(rewind?: (n: number) => Promise<RewindResult>): {
  ctx: CommandContext
  events: UiOutput[]
  calls: number[]
} {
  const events: UiOutput[] = []
  const calls: number[] = []
  const session = {
    getModel: () => 'sonnet',
    getTurns: () => 1,
    clearHistory: () => {},
    forceCompact: () => {},
    rewindTurns: rewind
      ? (n: number) => {
          calls.push(n)
          return rewind(n)
        }
      : undefined,
  } as unknown as SessionControl
  return { events, calls, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

const applied = (over?: Partial<Extract<RewindResult, { kind: 'applied' }>>): RewindResult => ({
  kind: 'applied',
  turnsDropped: 1,
  messagesDropped: 2,
  filesReverted: 1,
  ...over,
})

describe('RewindCommand', () => {
  test('defaults to one turn and reports turns + files', async () => {
    const { ctx, events, calls } = makeCtx(async () => applied())
    await new RewindCommand().execute([], ctx)
    expect(calls).toEqual([1])
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('Rewound 1 turn from context')
    expect(ev.text).toContain('reverted 1 file edit')
  })

  test('passes an explicit turn count', async () => {
    const { ctx, calls } = makeCtx(async () => applied({ turnsDropped: 3 }))
    await new RewindCommand().execute(['3'], ctx)
    expect(calls).toEqual([3])
  })

  test('rejects non-positive / non-integer counts without calling the runtime', async () => {
    for (const bad of ['0', '-1', 'abc']) {
      const { ctx, events, calls } = makeCtx(async () => applied())
      await new RewindCommand().execute([bad], ctx)
      expect(calls).toEqual([])
      expect(events[0].kind).toBe('note')
      if (events[0].kind === 'note') expect(events[0].tone).toBe('warn')
    }
  })

  test('reports when there is nothing to rewind', async () => {
    const { ctx, events } = makeCtx(async () => ({ kind: 'empty' }))
    await new RewindCommand().execute([], ctx)
    if (events[0].kind === 'note') expect(events[0].text).toContain('Nothing to rewind')
  })

  test('warns when the runtime does not support rewind', async () => {
    const { ctx, events } = makeCtx(undefined)
    await new RewindCommand().execute([], ctx)
    if (events[0].kind === 'note') expect(events[0].tone).toBe('warn')
  })
})
