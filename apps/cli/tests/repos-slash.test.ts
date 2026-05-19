import { describe, expect, test } from 'bun:test'
import { ReposSlashCommand } from '../src/commands/builtin/repos-slash'
import type { CommandContext } from '../src/commands/registry'
import type { UiOutput } from '../src/commands/ui-output'

function makeCtx(overrides: Partial<CommandContext> = {}): {
  ctx: CommandContext
  outputs: UiOutput[]
} {
  const outputs: UiOutput[] = []
  const ctx: CommandContext = {
    cwd: '/tmp/repos-slash-test',
    session: {
      getModel: () => 'claude-sonnet-4-6',
      setModel: (m) => m,
      getPermissionMode: () => 'workspace-write',
      getSessionId: () => 'session-id',
      getTurns: () => 0,
      getUsage: () => ({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }),
      clearHistory: () => {},
      forceCompact: () => {},
    },
    ui: (o) => outputs.push(o),
    ...overrides,
  }
  return { ctx, outputs }
}

function fakeFetch(repos: Array<{ fullName: string; installed: boolean; monitored: boolean }>): typeof fetch {
  return (async () => new Response(JSON.stringify({ repos }), { status: 200 })) as unknown as typeof fetch
}

const baseConfig = {
  serverUrl: 'http://localhost:3001',
  orgId: 'acme',
  apiKey: 'orch_test_key',
}

describe('ReposSlashCommand', () => {
  test('emits a repo-picker UI output with all returned repos', async () => {
    const cmd = new ReposSlashCommand({
      loadConfig: () => baseConfig,
      fetch: fakeFetch([
        { fullName: 'acme/api', installed: true, monitored: true },
        { fullName: 'acme/web', installed: true, monitored: false },
        { fullName: 'other/lib', installed: false, monitored: false },
      ]),
      getActiveRepo: () => null,
    })
    const { ctx, outputs } = makeCtx()
    const ok = await cmd.execute([], ctx)
    expect(ok).toBe(true)

    const picker = outputs.find((o) => o.kind === 'repo-picker')
    expect(picker).toBeDefined()
    if (picker?.kind !== 'repo-picker') throw new Error('expected repo-picker')
    expect(picker.repos.map((r) => r.fullName)).toEqual(['acme/api', 'acme/web', 'other/lib'])
  })

  test('forwards the active repo as the initial selection', async () => {
    const cmd = new ReposSlashCommand({
      loadConfig: () => baseConfig,
      fetch: fakeFetch([
        { fullName: 'acme/api', installed: true, monitored: true },
        { fullName: 'acme/web', installed: true, monitored: false },
      ]),
      getActiveRepo: () => 'acme/web',
    })
    const { ctx, outputs } = makeCtx()
    await cmd.execute([], ctx)
    const picker = outputs.find((o) => o.kind === 'repo-picker')
    if (picker?.kind !== 'repo-picker') throw new Error('expected repo-picker')
    expect(picker.current).toBe('acme/web')
  })

  test('emits a note when the user has not signed in', async () => {
    const cmd = new ReposSlashCommand({
      loadConfig: () => {
        const err = new Error('Missing Orchentra config: orgId')
        err.name = 'MissingOrchentraConfigError'
        throw err
      },
      fetch: fakeFetch([]),
      getActiveRepo: () => null,
    })
    const { ctx, outputs } = makeCtx()
    const ok = await cmd.execute([], ctx)
    expect(ok).toBe(true)

    const note = outputs.find((o) => o.kind === 'note')
    expect(note).toBeDefined()
    if (note?.kind !== 'note') throw new Error('expected note')
    expect(note.tone).toBe('warn')
    expect(note.text).toContain('orchentra init')
  })

  test('emits a warn note when the server returns non-2xx', async () => {
    const cmd = new ReposSlashCommand({
      loadConfig: () => baseConfig,
      fetch: (async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch,
      getActiveRepo: () => null,
    })
    const { ctx, outputs } = makeCtx()
    await cmd.execute([], ctx)
    const note = outputs.find((o) => o.kind === 'note')
    expect(note?.kind === 'note' && note.tone === 'warn').toBe(true)
  })
})
