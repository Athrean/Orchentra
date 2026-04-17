import { describe, expect, test } from 'bun:test'
import { ConversationRuntime, type ConversationConfig, type ConversationDeps } from '../src/runtime/conversation'
import type { Provider, ProviderStreamEvent } from '../src/runtime/provider'
import type { ToolRegistry, ToolResult } from '../src/runtime/tools'
import type { RuntimeEvent } from '../src/runtime/events'
import { buildSystemPrompt } from '../src/runtime/system-prompt'

function fakeProvider(responses: ProviderStreamEvent[][]): Provider {
  let callIndex = 0
  return {
    async *stream() {
      const resp = responses[callIndex++] ?? []
      for (const ev of resp) yield ev
    },
  }
}

function noopTools(): ToolRegistry {
  return {
    list: () => [],
    has: () => false,
    execute: async (): Promise<ToolResult> => ({
      content: 'noop',
      isError: false,
    }),
  }
}

function makeConfig(overrides?: Partial<ConversationConfig>): ConversationConfig {
  return {
    model: 'test',
    maxOutputTokens: 1024,
    contextWindowTokens: 100000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 10, maxTokens: 100000 },
    sessionId: 'test-session',
    cwd: '/tmp',
    ...overrides,
  }
}

function makeDeps(provider: Provider, tools?: ToolRegistry): ConversationDeps {
  return {
    provider,
    tools: tools ?? noopTools(),
    systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
  }
}

async function collect(runtime: ConversationRuntime, input: string): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = []
  for await (const ev of runtime.run({ userMessage: input })) {
    events.push(ev)
  }
  return events
}

describe('ConversationRuntime', () => {
  test('streams text and stops', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'hello' },
        { kind: 'text-delta', delta: ' world' },
        { kind: 'usage', usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider))
    const events = await collect(rt, 'hi')

    const texts = events.filter((e) => e.kind === 'text')
    expect(texts).toEqual([
      { kind: 'text', delta: 'hello' },
      { kind: 'text', delta: ' world' },
    ])

    const done = events.find((e) => e.kind === 'done')
    expect(done).toMatchObject({ kind: 'done', reason: 'stop', steps: 1 })
  })

  test('budget exhaustion stops the loop', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'hi' },
        {
          kind: 'usage',
          usage: { inputTokens: 99999, outputTokens: 99999, cacheReadTokens: 0, cacheCreationTokens: 0 },
        },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const config = makeConfig({ budget: { maxSteps: 10, maxTokens: 100 } })
    const rt = new ConversationRuntime(config, makeDeps(provider))
    const events = await collect(rt, 'go')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done).toBeDefined()
    expect(done.reason).toBe('stop')
  })

  test('max steps exhaustion', async () => {
    const manyResponses = Array.from({ length: 20 }, (_, i): ProviderStreamEvent[] => [
      { kind: 'tool-use', call: { id: `tc${i}`, name: 'ping', input: {} } },
      { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
      { kind: 'finish', stopReason: 'tool_use' },
    ])
    const provider = fakeProvider(manyResponses)

    const toolCalls: ToolRegistry = {
      list: () => [{ name: 'ping', description: 'ping', inputSchema: {} }],
      has: () => true,
      execute: async () => ({ content: 'pong', isError: false }),
    }

    const config = makeConfig({ budget: { maxSteps: 3, maxTokens: 1000000 } })
    const rt = new ConversationRuntime(config, makeDeps(provider, toolCalls))
    const events = await collect(rt, 'loop')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done).toBeDefined()
    expect(done.reason).toBe('max_steps')
    expect(done.steps).toBeGreaterThanOrEqual(3)
  })

  test('tool call round-trip', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: { path: '/a' } } },
        { kind: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'usage', usage: { inputTokens: 8, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])

    let executed = false
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read file', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async (_name, args) => {
        executed = true
        expect(args).toEqual({ path: '/a' })
        return { content: 'file content', isError: false }
      },
    }

    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, tools))
    const events = await collect(rt, 'read file')

    expect(executed).toBe(true)
    const toolUse = events.find((e) => e.kind === 'tool_use')
    expect(toolUse).toMatchObject({ kind: 'tool_use', call: { name: 'read' } })
    const toolResult = events.find((e) => e.kind === 'tool_result')
    expect(toolResult).toMatchObject({ kind: 'tool_result', result: { content: 'file content', isError: false } })
    const done = events.find((e) => e.kind === 'done')
    expect(done).toMatchObject({ kind: 'done', reason: 'stop' })
  })

  test('provider error emits error event and stops', async () => {
    const provider: Provider = {
      stream(): AsyncIterable<ProviderStreamEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                throw new Error('provider blew up')
              },
            }
          },
        }
      },
    }
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider))
    const events = await collect(rt, 'hi')

    const err = events.find((e) => e.kind === 'error')
    expect(err).toMatchObject({ kind: 'error', message: 'provider blew up' })
    const done = events.find((e) => e.kind === 'done')
    expect(done).toMatchObject({ kind: 'done', reason: 'error' })
  })

  test('abort signal stops the loop', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'partial' },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const controller = new AbortController()
    controller.abort()
    const deps = { ...makeDeps(provider), signal: controller.signal }
    const rt = new ConversationRuntime(makeConfig(), deps)
    const events = await collect(rt, 'hi')

    const done = events.find((e) => e.kind === 'done')
    expect(done).toMatchObject({ kind: 'done', reason: 'aborted' })
  })
})
