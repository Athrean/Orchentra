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
