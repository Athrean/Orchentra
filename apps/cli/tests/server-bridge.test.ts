import { describe, expect, test } from 'bun:test'
import { createServerCommand } from '../src/commands/builtin/server-bridge'
import type { CommandContext } from '../src/commands/registry'
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

function captureStdout(): { stop: () => string } {
  const original = process.stdout.write.bind(process.stdout)
  const chunks: string[] = []
  process.stdout.write = ((c: string | Uint8Array): boolean => {
    chunks.push(typeof c === 'string' ? c : new TextDecoder().decode(c))
    return true
  }) as typeof process.stdout.write
  return {
    stop: () => {
      process.stdout.write = original
      return chunks.join('')
    },
  }
}

describe('createServerCommand', () => {
  test('forwards command name, args, sessionId, cwd to send and writes chunks to stdout', async () => {
    let received: { command: string; args: readonly string[]; sessionId: string; cwd: string } | null = null
    const handler = createServerCommand({ name: 'incidents', aliases: [], summary: 'List incidents' }, 'status', {
      send: async function* (input) {
        received = input
        yield 'first '
        yield 'second\n'
      },
    })

    const ctx: CommandContext = { cwd: '/work', session: makeSession('sess-1') }
    const cap = captureStdout()
    const ok = await handler.execute(['--limit', '5'], ctx)
    const out = cap.stop()

    expect(ok).toBe(true)
    expect(out).toBe('first second\n')
    expect(received).toEqual({
      command: 'status',
      args: ['--limit', '5'],
      sessionId: 'sess-1',
      cwd: '/work',
    })
  })

  test('appends a trailing newline if the stream did not end with one', async () => {
    const handler = createServerCommand({ name: 'x', aliases: [], summary: 's' }, 'status', {
      send: async function* () {
        yield 'no newline'
      },
    })
    const cap = captureStdout()
    await handler.execute([], { cwd: '/w', session: makeSession() })
    expect(cap.stop()).toBe('no newline\n')
  })

  test('surfaces send errors as a printed error line and returns true', async () => {
    const handler = createServerCommand({ name: 'x', aliases: [], summary: 's' }, 'status', {
      send: async function* () {
        throw new Error('Invalid API key')
        yield ''
      },
    })
    const cap = captureStdout()
    const ok = await handler.execute([], { cwd: '/w', session: makeSession() })
    const out = cap.stop()
    expect(ok).toBe(true)
    expect(out).toContain('Invalid API key')
    expect(out.startsWith('error:')).toBe(true)
  })
})
