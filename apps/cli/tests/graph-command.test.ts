import { describe, expect, test } from 'bun:test'
import { createGraphCommand } from '../src/commands/builtin/graph'
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
  id: 'n1',
  parentNodeId: null,
  kind: 'tool_call',
  integration: 'github',
  round: 1,
  durationMs: 100,
  argsJson: null,
  resultJson: null,
  createdAt: '2026-04-29T00:00:00Z',
  ...overrides,
})

describe('createGraphCommand', () => {
  test('warns when no executionId arg', async () => {
    const handler = createGraphCommand({
      fetchGraph: async () => ({ executionId: '', nodes: [] }),
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute([], ctx)
    expect(ui).toHaveLength(1)
    expect(ui[0]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((ui[0] as { text: string }).text).toContain('usage')
  })

  test('fetches graph and emits formatted tree as text', async () => {
    let receivedExecutionId = ''
    const handler = createGraphCommand({
      fetchGraph: async (opts) => {
        receivedExecutionId = opts.executionId
        return {
          executionId: 'exec-1',
          nodes: [fakeNode({ id: 'p' }), fakeNode({ id: 'c', parentNodeId: 'p', round: 2 })],
        }
      },
      resolveConfig: () => ({ serverUrl: 'https://api', orgId: 'o1', apiKey: 'k' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['exec-1'], ctx)

    expect(receivedExecutionId).toBe('exec-1')
    const textOutput = ui.find((o) => o.kind === 'text')
    expect(textOutput).toBeDefined()
    const text = (textOutput as { text: string }).text
    expect(text).toContain('exec-1')
    expect(text).toContain('p')
    expect(text).toContain('c')
    expect(text).toMatch(/[├└]/)
  })

  test('emits info note when execution has no nodes', async () => {
    const handler = createGraphCommand({
      fetchGraph: async () => ({ executionId: 'exec-1', nodes: [] }),
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['exec-1'], ctx)
    expect(ui).toHaveLength(1)
    expect(ui[0]).toMatchObject({ kind: 'note', tone: 'info' })
  })

  test('emits warn note on fetch error', async () => {
    const handler = createGraphCommand({
      fetchGraph: async () => {
        throw new Error('network down')
      },
      resolveConfig: () => ({ serverUrl: '', orgId: '', apiKey: '' }),
    })
    const { ctx, ui } = makeCtx()
    await handler.execute(['exec-1'], ctx)
    expect(ui).toHaveLength(1)
    expect(ui[0]).toMatchObject({ kind: 'note', tone: 'warn' })
    expect((ui[0] as { text: string }).text).toContain('network down')
  })
})
