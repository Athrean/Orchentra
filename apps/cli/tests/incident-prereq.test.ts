import { describe, expect, test } from 'bun:test'
import { withIncidentPrereq } from '../src/commands/builtin/incident-prereq'
import type { CommandContext, CommandHandler } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'
import type { SessionControl } from '@orchentra/cli-core'

function makeSession(sessionId = 'sess-test'): SessionControl {
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'default',
    getSessionId: () => sessionId,
    getTurns: () => 0,
    getUsage: () => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    }),
    clearHistory: () => {},
    forceCompact: () => {},
  } as unknown as SessionControl
}

function makeInnerHandler(name = 'incident'): {
  handler: CommandHandler
  calls: Array<{ args: readonly string[]; cwd: string }>
} {
  const calls: Array<{ args: readonly string[]; cwd: string }> = []
  const handler: CommandHandler = {
    spec: { name, aliases: [], summary: 's' },
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      calls.push({ args, cwd: ctx.cwd })
      return true
    },
  }
  return { handler, calls }
}

describe('withIncidentPrereq', () => {
  test('preserves the spec of the wrapped handler', () => {
    const { handler } = makeInnerHandler('incident')
    const wrapped = withIncidentPrereq(handler, { check: async () => ({ ok: true }) })
    expect(wrapped.spec).toEqual(handler.spec)
  })

  test('delegates to inner handler when prereq passes', async () => {
    const { handler, calls } = makeInnerHandler()
    const wrapped = withIncidentPrereq(handler, { check: async () => ({ ok: true }) })
    const events: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: '/work',
      session: makeSession(),
      ui: (o) => events.push(o),
    }
    const result = await wrapped.execute(['--limit', '5'], ctx)
    expect(result).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ args: ['--limit', '5'], cwd: '/work' })
    // No card emitted when prereq passes
    expect(events.find((e) => e.kind === 'card')).toBeUndefined()
  })

  test('renders a /status-style card when prereq fails — does not call inner handler', async () => {
    const { handler, calls } = makeInnerHandler()
    const wrapped = withIncidentPrereq(handler, {
      check: async () => ({
        ok: false,
        rows: [
          { key: 'Orchentra config', value: 'missing — set ORCHENTRA_ORG_ID + ORCHENTRA_API_KEY' },
          { key: 'GitHub App', value: 'unknown (need config to check)' },
        ],
      }),
    })
    const events: UiOutput[] = []
    const ctx: CommandContext = {
      cwd: '/work',
      session: makeSession(),
      ui: (o) => events.push(o),
    }
    const result = await wrapped.execute([], ctx)
    expect(result).toBe(true)
    expect(calls).toHaveLength(0)
    const card = events.find((e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card')
    expect(card).toBeDefined()
    expect(card!.title).toMatch(/incident/i)
    const flatRows = card!.sections.flatMap((s) => s.rows)
    const keys = flatRows.map((r) => r.key)
    expect(keys).toContain('Orchentra config')
    expect(keys).toContain('GitHub App')
  })

  // Slice 5: when the prereq probe fails AND a ui sink is present AND
  // a bootstrap hook is injected, offer 'Bootstrap now? [Y/n]' BEFORE
  // rendering the tabular menu. On Y the orchestrator runs; the probe
  // is then re-evaluated, and if the second check passes the wrapped
  // /incident handler executes immediately. On n the legacy tabular
  // menu still renders, preserving the current behavior for users who
  // can't bootstrap from the prompt (e.g. no GitHub origin).
  describe('bootstrap prompt before tabular menu', () => {
    test('Y → bootstrap → recheck passes → inner handler runs once', async () => {
      const { handler, calls } = makeInnerHandler()
      let checkCount = 0
      const bootstrapCalls: number[] = []
      const wrapped = withIncidentPrereq(
        handler,
        {
          check: async () => {
            checkCount++
            // First call fails, second call (after bootstrap) passes.
            return checkCount === 1 ? { ok: false, rows: [{ key: 'k', value: 'v' }] } : { ok: true }
          },
        },
        {
          promptBootstrap: async () => true,
          runBootstrap: async () => {
            bootstrapCalls.push(1)
          },
        },
      )
      const events: UiOutput[] = []
      const ctx: CommandContext = { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) }
      const result = await wrapped.execute(['--limit', '3'], ctx)
      expect(result).toBe(true)
      expect(bootstrapCalls).toEqual([1])
      expect(checkCount).toBe(2)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({ args: ['--limit', '3'], cwd: '/work' })
      // The tabular 'prereqs missing' menu must NOT have rendered when
      // bootstrap succeeded — the user got straight through.
      const missingCard = events.find(
        (e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''),
      )
      expect(missingCard).toBeUndefined()
    })

    test('n → existing tabular menu rendered, inner handler not called', async () => {
      const { handler, calls } = makeInnerHandler()
      let checkCount = 0
      const bootstrapCalls: number[] = []
      const wrapped = withIncidentPrereq(
        handler,
        {
          check: async () => {
            checkCount++
            return { ok: false, rows: [{ key: 'Orchentra config', value: 'missing' }] }
          },
        },
        {
          promptBootstrap: async () => false,
          runBootstrap: async () => {
            bootstrapCalls.push(1)
          },
        },
      )
      const events: UiOutput[] = []
      const ctx: CommandContext = { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) }
      await wrapped.execute([], ctx)
      expect(bootstrapCalls).toEqual([])
      // Only the initial probe ran — no re-check after 'n'.
      expect(checkCount).toBe(1)
      expect(calls).toHaveLength(0)
      const card = events.find(
        (e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''),
      )
      expect(card).toBeDefined()
    })

    test('Y → bootstrap → recheck still fails → tabular menu rendered', async () => {
      // Defensive: if the bootstrap orchestrator reports success but the
      // local config probe still can't see the new artifacts (e.g. file
      // race), fall back to the legacy menu so the user sees actionable
      // diagnostics instead of a silent no-op.
      const { handler, calls } = makeInnerHandler()
      const wrapped = withIncidentPrereq(
        handler,
        {
          check: async () => ({ ok: false, rows: [{ key: 'k', value: 'v' }] }),
        },
        {
          promptBootstrap: async () => true,
          runBootstrap: async () => {
            /* no-op: pretend the orchestrator returned but config still missing */
          },
        },
      )
      const events: UiOutput[] = []
      const ctx: CommandContext = { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) }
      await wrapped.execute([], ctx)
      expect(calls).toHaveLength(0)
      const card = events.find(
        (e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''),
      )
      expect(card).toBeDefined()
    })

    test('no bootstrap hook → legacy tabular menu (current behaviour)', async () => {
      // This case re-asserts what the existing 'renders a /status-style
      // card' test already covers, but framed as 'hook is omitted' for
      // intent.
      const { handler, calls } = makeInnerHandler()
      const wrapped = withIncidentPrereq(handler, {
        check: async () => ({ ok: false, rows: [{ key: 'k', value: 'v' }] }),
      })
      const events: UiOutput[] = []
      const ctx: CommandContext = { cwd: '/work', session: makeSession(), ui: (o) => events.push(o) }
      await wrapped.execute([], ctx)
      expect(calls).toHaveLength(0)
      const card = events.find(
        (e): e is Extract<UiOutput, { kind: 'card' }> => e.kind === 'card' && /prereqs missing/i.test(e.title ?? ''),
      )
      expect(card).toBeDefined()
    })
  })

  test('plaintext fallback prints rows when no ui sink', async () => {
    const { handler, calls } = makeInnerHandler()
    const wrapped = withIncidentPrereq(handler, {
      check: async () => ({
        ok: false,
        rows: [{ key: 'Orchentra config', value: 'missing' }],
      }),
    })
    const original = process.stdout.write.bind(process.stdout)
    const chunks: string[] = []
    process.stdout.write = ((c: string | Uint8Array): boolean => {
      chunks.push(typeof c === 'string' ? c : new TextDecoder().decode(c))
      return true
    }) as typeof process.stdout.write
    try {
      const ctx: CommandContext = { cwd: '/work', session: makeSession() }
      const result = await wrapped.execute([], ctx)
      expect(result).toBe(true)
      expect(calls).toHaveLength(0)
      const out = chunks.join('')
      expect(out).toContain('Orchentra config')
      expect(out).toContain('missing')
    } finally {
      process.stdout.write = original
    }
  })
})
