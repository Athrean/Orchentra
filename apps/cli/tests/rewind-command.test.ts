import { describe, expect, test } from 'bun:test'
import { RewindCommand } from '../src/commands/builtin/terminal-parity'
import type { CommandContext } from '../src/commands/registry'
import type { RewindPreview, RewindResult, SessionControl } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'

interface Hooks {
  rewind?: (n: number) => Promise<RewindResult>
  preview?: (n: number) => Promise<RewindPreview>
}

function makeCtx(hooks: Hooks = {}): {
  ctx: CommandContext
  events: UiOutput[]
  rewindCalls: number[]
  previewCalls: number[]
} {
  const events: UiOutput[] = []
  const rewindCalls: number[] = []
  const previewCalls: number[] = []
  const session = {
    getModel: () => 'sonnet',
    getTurns: () => 1,
    clearHistory: () => {},
    forceCompact: () => {},
    rewindTurns: hooks.rewind
      ? (n: number) => {
          rewindCalls.push(n)
          return hooks.rewind!(n)
        }
      : undefined,
    previewRewindTurns: hooks.preview
      ? (n: number) => {
          previewCalls.push(n)
          return hooks.preview!(n)
        }
      : undefined,
  } as unknown as SessionControl
  return { events, rewindCalls, previewCalls, ctx: { cwd: '/w', session, ui: (o) => events.push(o) } }
}

const applied = (over?: Partial<Extract<RewindResult, { kind: 'applied' }>>): RewindResult => ({
  kind: 'applied',
  turnsDropped: 1,
  messagesDropped: 2,
  filesReverted: 1,
  ...over,
})

const preview = (over?: Partial<Extract<RewindPreview, { kind: 'preview' }>>): RewindPreview => ({
  kind: 'preview',
  turnsToDrop: 1,
  messagesToDrop: 2,
  files: [{ path: '/w/src/a.ts', action: 'restore', linesAdded: 3, linesRemoved: 5 }],
  ...over,
})

describe('RewindCommand — preview gate', () => {
  test('without --yes it previews and does NOT apply', async () => {
    const { ctx, events, rewindCalls, previewCalls } = makeCtx({
      rewind: async () => applied(),
      preview: async () => preview(),
    })
    await new RewindCommand().execute([], ctx)
    expect(previewCalls).toEqual([1])
    expect(rewindCalls).toEqual([]) // never mutated
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected a preview card')
    expect(ev.title).toContain('Rewind preview')
    const flat = JSON.stringify(ev.sections)
    expect(flat).toContain('src/a.ts')
    expect(flat).toContain('+3/-5')
    expect(flat).toContain('/rewind 1 --yes')
  })

  test('preview reports context-only when the turn touched no files', async () => {
    const { ctx, events } = makeCtx({ preview: async () => preview({ files: [] }) })
    await new RewindCommand().execute([], ctx)
    const ev = events[0]
    if (ev.kind !== 'card') throw new Error('expected a preview card')
    expect(JSON.stringify(ev.sections)).toContain('context only')
  })

  test('with --yes it applies and reports turns + files', async () => {
    const { ctx, events, rewindCalls, previewCalls } = makeCtx({
      rewind: async () => applied(),
      preview: async () => preview(),
    })
    await new RewindCommand().execute(['--yes'], ctx)
    expect(rewindCalls).toEqual([1])
    expect(previewCalls).toEqual([]) // preview skipped once confirmed
    const ev = events[0]
    if (ev.kind !== 'note') throw new Error('expected note')
    expect(ev.text).toContain('Rewound 1 turn from context')
    expect(ev.text).toContain('reverted 1 file edit')
  })

  test('positional turn count works alongside --yes in any order', async () => {
    const { ctx, rewindCalls } = makeCtx({ rewind: async () => applied({ turnsDropped: 3 }) })
    await new RewindCommand().execute(['-y', '3'], ctx)
    expect(rewindCalls).toEqual([3])
  })

  test('preview passes an explicit turn count', async () => {
    const { ctx, previewCalls } = makeCtx({ preview: async () => preview({ turnsToDrop: 2 }) })
    await new RewindCommand().execute(['2'], ctx)
    expect(previewCalls).toEqual([2])
  })

  test('rejects non-positive / non-integer counts without calling the runtime', async () => {
    for (const bad of ['0', '-2', 'abc']) {
      const { ctx, events, rewindCalls, previewCalls } = makeCtx({
        rewind: async () => applied(),
        preview: async () => preview(),
      })
      await new RewindCommand().execute([bad], ctx)
      expect(rewindCalls).toEqual([])
      expect(previewCalls).toEqual([])
      expect(events[0].kind).toBe('note')
      if (events[0].kind === 'note') expect(events[0].tone).toBe('warn')
    }
  })

  test('preview reports when there is nothing to rewind', async () => {
    const { ctx, events } = makeCtx({ preview: async () => ({ kind: 'empty' }) })
    await new RewindCommand().execute([], ctx)
    if (events[0].kind === 'note') expect(events[0].text).toContain('Nothing to rewind')
  })

  test('warns when the runtime does not support preview', async () => {
    const { ctx, events } = makeCtx({})
    await new RewindCommand().execute([], ctx)
    if (events[0].kind === 'note') expect(events[0].tone).toBe('warn')
  })

  test('warns when the runtime does not support rewind on --yes', async () => {
    const { ctx, events } = makeCtx({ preview: async () => preview() })
    await new RewindCommand().execute(['--yes'], ctx)
    if (events[0].kind === 'note') expect(events[0].tone).toBe('warn')
  })
})
