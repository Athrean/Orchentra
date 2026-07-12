import { describe, expect, test } from 'bun:test'
import { ConversationRuntime, type ConversationConfig, type ConversationDeps } from '../src/runtime/conversation'
import { LoopDetector, toolCallSignature } from '../src/runtime/loop-detector'
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

function echoTools(): ToolRegistry {
  return {
    list: () => [{ name: 'ping', description: 'ping', inputSchema: {} }],
    has: () => true,
    execute: async (): Promise<ToolResult> => ({ content: 'pong', isError: false }),
  }
}

function makeConfig(overrides?: Partial<ConversationConfig>): ConversationConfig {
  return {
    model: 'test',
    maxOutputTokens: 1024,
    contextWindowTokens: 100000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 50, maxTokens: 1_000_000 },
    sessionId: 'test-session',
    cwd: '/tmp',
    ...overrides,
  }
}

function makeDeps(provider: Provider, tools?: ToolRegistry): ConversationDeps {
  return {
    provider,
    tools: tools ?? echoTools(),
    systemPrompt: buildSystemPrompt({ staticParts: ['sys'], dynamicParts: [] }),
    persistToolOutput: async () => {},
  }
}

async function collect(runtime: ConversationRuntime, input: string): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = []
  for await (const ev of runtime.run({ userMessage: input })) {
    events.push(ev)
  }
  return events
}

describe('toolCallSignature', () => {
  test('collapses inputs differing only in counters, offsets, and path prefixes', () => {
    const a = toolCallSignature({ id: 't1', name: 'read', input: { path: '/repo/src/a.ts', offset: 0 } })
    const b = toolCallSignature({ id: 't2', name: 'read', input: { path: '/other/dir/a.ts', offset: 2000 } })
    expect(a).toBe(b)
  })

  test('distinguishes tool names and materially different inputs', () => {
    const read = toolCallSignature({ id: 't1', name: 'read', input: { path: 'a.ts' } })
    const write = toolCallSignature({ id: 't2', name: 'write', input: { path: 'a.ts' } })
    const otherFile = toolCallSignature({ id: 't3', name: 'read', input: { path: 'b.ts' } })
    expect(read).not.toBe(write)
    expect(read).not.toBe(otherFile)
  })
})

describe('LoopDetector', () => {
  const call = (id: string): { id: string; name: string; input: unknown } => ({ id, name: 'ping', input: { n: 1 } })

  test('flags a signature once it repeats threshold times within the window', () => {
    const detector = new LoopDetector({ repeatThreshold: 3, windowSize: 8 })
    expect(detector.record(call('a')).looping).toBe(false)
    expect(detector.record(call('b')).looping).toBe(false)
    const third = detector.record(call('c'))
    expect(third.looping).toBe(true)
    expect(third.count).toBe(3)
  })

  test('old calls fall out of the window', () => {
    const detector = new LoopDetector({ repeatThreshold: 3, windowSize: 2 })
    detector.record(call('a'))
    detector.record(call('b'))
    // Window only holds 2 entries, so the count can never reach 3.
    expect(detector.record(call('c')).looping).toBe(false)
  })

  test('repeatThreshold 0 disables detection', () => {
    const detector = new LoopDetector({ repeatThreshold: 0 })
    for (let i = 0; i < 20; i++) {
      expect(detector.record(call(`c${i}`)).looping).toBe(false)
    }
  })
})

describe('ConversationRuntime loop detection', () => {
  test('a seeded repeating tool-call loop is broken with reason loop_detected', async () => {
    // Seed a stuck agent: every step issues the same tool call with only a
    // retry counter changing. Without the detector this runs to max_steps.
    const responses = Array.from({ length: 30 }, (_, i): ProviderStreamEvent[] => [
      { kind: 'tool-use', call: { id: `tc${i}`, name: 'ping', input: { attempt: i } } },
      { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
      { kind: 'finish', stopReason: 'tool_use' },
    ])
    const rt = new ConversationRuntime(makeConfig(), makeDeps(fakeProvider(responses)))
    const events = await collect(rt, 'go')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done).toBeDefined()
    expect(done.reason).toBe('loop_detected')
    // Terminated by the detector (default threshold 6), far short of maxSteps 50.
    expect(done.steps).toBeLessThan(10)

    const detected = events.find((e) => e.kind === 'loop_detected') as Extract<RuntimeEvent, { kind: 'loop_detected' }>
    expect(detected).toBeDefined()
    expect(detected.toolName).toBe('ping')
    expect(detected.count).toBe(6)
  })

  test('an A-B cycle is broken even though no call repeats consecutively', async () => {
    const responses = Array.from({ length: 30 }, (_, i): ProviderStreamEvent[] => [
      {
        kind: 'tool-use',
        call:
          i % 2 === 0
            ? { id: `a${i}`, name: 'ping', input: { probe: 'x' } }
            : { id: `b${i}`, name: 'ping', input: { probe: 'y' } },
      },
      { kind: 'finish', stopReason: 'tool_use' },
    ])
    const config = makeConfig({ loopDetection: { repeatThreshold: 4, windowSize: 16 } })
    const rt = new ConversationRuntime(config, makeDeps(fakeProvider(responses)))
    const events = await collect(rt, 'go')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done.reason).toBe('loop_detected')
  })

  test('the flagged call is not executed and history is sealed with an error tool result', async () => {
    let executions = 0
    const tools: ToolRegistry = {
      list: () => [{ name: 'ping', description: 'ping', inputSchema: {} }],
      has: () => true,
      execute: async (): Promise<ToolResult> => {
        executions++
        return { content: 'pong', isError: false }
      },
    }
    const responses = Array.from({ length: 10 }, (_, i): ProviderStreamEvent[] => [
      { kind: 'tool-use', call: { id: `tc${i}`, name: 'ping', input: {} } },
      { kind: 'finish', stopReason: 'tool_use' },
    ])
    const config = makeConfig({ loopDetection: { repeatThreshold: 3 } })
    const rt = new ConversationRuntime(config, makeDeps(fakeProvider(responses), tools))
    const events = await collect(rt, 'go')

    expect(executions).toBe(2)
    const results = events.filter((e): e is Extract<RuntimeEvent, { kind: 'tool_result' }> => e.kind === 'tool_result')
    const sealed = results[results.length - 1]!
    expect(sealed.result.isError).toBe(true)
    expect(sealed.result.content).toContain('loop detected')

    // Every emitted tool_use has a matching tool result, so the next provider
    // request would not see a dangling tool_use block.
    const finalMessages = rt.getFinalMessages()
    const toolCallIds = finalMessages
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => m.toolCalls ?? [])
      .map((c) => c.id)
    const resultIds = finalMessages.filter((m) => m.role === 'tool').map((m) => m.toolCallId)
    expect(new Set(resultIds)).toEqual(new Set(toolCallIds))
  })

  test('detection disabled with repeatThreshold 0 falls through to max_steps', async () => {
    const responses = Array.from({ length: 30 }, (_, i): ProviderStreamEvent[] => [
      { kind: 'tool-use', call: { id: `tc${i}`, name: 'ping', input: {} } },
      { kind: 'finish', stopReason: 'tool_use' },
    ])
    const config = makeConfig({
      budget: { maxSteps: 8, maxTokens: 1_000_000 },
      loopDetection: { repeatThreshold: 0 },
    })
    const rt = new ConversationRuntime(config, makeDeps(fakeProvider(responses)))
    const events = await collect(rt, 'go')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done.reason).toBe('max_steps')
  })
})
