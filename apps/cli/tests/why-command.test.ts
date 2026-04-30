import { describe, expect, test } from 'bun:test'
import { createWhyCommand } from '../src/commands/builtin/why'
import type { CommandContext } from '../src/commands/registry'
import type { SessionControl } from '@orchentra/cli-core'
import type { UiOutput } from '../src/commands/ui-output'
import type { GraphNodeDto } from '@orchentra/cli-api'

function makeSession(): SessionControl {
  return {
    getModel: () => 'm',
    setModel: () => 'm',
    getPermissionMode: () => 'default',
    getSessionId: () => 'sess-1',
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

function makeCtx(): { ctx: CommandContext; ui: UiOutput[] } {
  const ui: UiOutput[] = []
  const ctx: CommandContext = {
    cwd: '/work',
    session: makeSession(),
    ui: (o) => ui.push(o),
  }
  return { ctx, ui }
}

const fakeNode = (overrides: Partial<GraphNodeDto> = {}): GraphNodeDto => ({
  id: 'leaf',
  parentNodeId: 'mid',
  kind: 'tool_call',
  integration: 'github',
  round: 3,
  durationMs: 200,
  argsJson: null,
  resultJson: null,
  createdAt: '2026-04-29T00:00:00Z',
  ...overrides,
})

describe('createWhyCommand', () => {
  test('warns when no nodeId arg', async () => {
    const handler = createWhyCommand({
      fetchLineage: async () => ({ node: fakeNode(), ancestors: [] }),
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute([], ctx)
    expect(ui).toHaveLength(1)
    expect(ui[0]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((ui[0] as { text: string }).text).toContain('usage')
  })

  test('renders ancestors → leaf chain with the leaf marker', async () => {
    let receivedNodeId = ''
    const handler = createWhyCommand({
      fetchLineage: async (opts) => {
        receivedNodeId = opts.nodeId
        return {
          node: fakeNode({ id: 'leaf', parentNodeId: 'mid' }),
          ancestors: [
            fakeNode({ id: 'root', parentNodeId: null, round: 1 }),
            fakeNode({ id: 'mid', parentNodeId: 'root', round: 2 }),
          ],
        }
      },
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['leaf'], ctx)

    expect(receivedNodeId).toBe('leaf')
    const out = ui.find((o) => o.kind === 'text') as { text: string }
    expect(out).toBeDefined()
    expect(out.text).toContain('root')
    expect(out.text).toContain('mid')
    expect(out.text).toContain('leaf')
    expect(out.text).toMatch(/←/)
  })

  test('renders inputs section when leaf has argsJson', async () => {
    const handler = createWhyCommand({
      fetchLineage: async () => ({
        node: fakeNode({ argsJson: '{"reason":"alert triaged"}' }),
        ancestors: [],
      }),
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['leaf'], ctx)
    const out = ui.find((o) => o.kind === 'text') as { text: string }
    expect(out.text).toMatch(/inputs/i)
    expect(out.text).toContain('alert triaged')
  })

  test('renders outcome section when leaf has resultJson', async () => {
    const handler = createWhyCommand({
      fetchLineage: async () => ({
        node: fakeNode({ resultJson: '{"status":"resolved"}' }),
        ancestors: [],
      }),
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['leaf'], ctx)
    const out = ui.find((o) => o.kind === 'text') as { text: string }
    expect(out.text).toMatch(/outcome/i)
    expect(out.text).toContain('resolved')
  })

  test('emits warn note on fetch error', async () => {
    const handler = createWhyCommand({
      fetchLineage: async () => {
        throw new Error('node missing')
      },
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['x'], ctx)
    expect(ui).toHaveLength(1)
    expect(ui[0]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((ui[0] as { text: string }).text).toContain('node missing')
  })
})
