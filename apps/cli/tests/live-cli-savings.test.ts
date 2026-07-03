import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'

function fakeProvider(responses: ProviderStreamEvent[][]): Provider {
  let callIndex = 0
  return {
    async *stream() {
      const resp = responses[callIndex++] ?? []
      for (const ev of resp) yield ev
    },
  }
}

function sharedState(): SharedToolState {
  return {
    taskStore: {
      create: () => {
        throw new Error('not used')
      },
      get: () => undefined,
      list: () => [],
      update: () => {},
      cancel: () => {},
    },
    todos: [],
    agentCounter: 0,
    planMode: false,
  }
}

function makeCli(provider: Provider, cwd: string): LiveCli {
  const tools = new DefaultToolRegistry()
  tools.register({
    name: 'blob',
    description: 'returns a huge output',
    level: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ content: 'x'.repeat(120_000), isError: false }),
  })
  const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
  return new LiveCli({
    model: 'test-model',
    permissionMode: 'workspace-write',
    provider,
    resolveModel,
    tools,
    cwd,
    sessionId: 'savings-session',
    sharedState: sharedState(),
  })
}

describe('LiveCli measured savings', () => {
  test('records tool-output budget trims in getSavings()', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-live-savings-'))
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'blob', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const cli = makeCli(provider, cwd)
    cli.setEventSink(() => {})

    expect(cli.getSavings()).toEqual({
      compactions: 0,
      compactionTokensSaved: 0,
      toolOutputTrims: 0,
      toolOutputCharsTrimmed: 0,
    })

    await cli.runTurn('dump the blob')

    const savings = cli.getSavings()
    expect(savings.toolOutputTrims).toBe(1)
    expect(savings.toolOutputCharsTrimmed).toBe(70_000) // 120k result − 50k default budget
  })

  test('records forced compaction savings in getSavings()', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-live-savings-'))
    const long = 'a definitely long enough message to survive token estimation '.repeat(20)
    const provider = fakeProvider(
      Array.from({ length: 12 }, () => [
        { kind: 'text-delta', delta: long } as ProviderStreamEvent,
        { kind: 'finish', stopReason: 'end_turn' } as ProviderStreamEvent,
      ]),
    )
    const cli = makeCli(provider, cwd)
    cli.setEventSink(() => {})

    for (let i = 0; i < 8; i++) await cli.runTurn(`turn ${i}: ${long}`)
    cli.forceCompact()
    await cli.runTurn('after compaction')

    const savings = cli.getSavings()
    expect(savings.compactions).toBe(1)
    expect(savings.compactionTokensSaved).toBeGreaterThan(0)
  })
})
