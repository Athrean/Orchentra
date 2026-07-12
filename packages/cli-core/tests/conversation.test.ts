import { describe, expect, test } from 'bun:test'
import { ConversationRuntime, type ConversationConfig, type ConversationDeps } from '../src/runtime/conversation'
import { RuntimeBudget } from '../src/runtime/budget'
import type { HookRunner } from '../src/runtime/hooks'
import type { ChatMessage, Provider, ProviderStreamEvent } from '../src/runtime/provider'
import type { ToolContext, ToolRegistry, ToolResult } from '../src/runtime/tools'
import type { RuntimeEvent } from '../src/runtime/events'
import { buildSystemPrompt } from '../src/runtime/system-prompt'
import { createEnforcer } from '../src/permissions/enforcer'

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
    // No-op by default so budgeting tests don't hit the real filesystem.
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

  test('uses the injected compaction summarizer for dropped turns', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'ok' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const config = makeConfig({ contextWindowTokens: 100, compactionThreshold: 0.1, keepRecentOnCompact: 2 })
    const deps: ConversationDeps = { ...makeDeps(provider), compactionSummarizer: async () => 'SUMMARIZER-RAN' }
    const rt = new ConversationRuntime(config, deps)
    const prior: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({
      role: 'user' as const,
      content: `old message ${i} ${'x'.repeat(80)}`,
    }))

    const events: RuntimeEvent[] = []
    for await (const ev of rt.run({ userMessage: 'new task', priorMessages: prior })) events.push(ev)

    const compacted = events.find((e): e is Extract<RuntimeEvent, { kind: 'compacted' }> => e.kind === 'compacted')
    expect(compacted).toBeDefined()
    expect(compacted!.summary).toBe('SUMMARIZER-RAN')
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
    expect(done.reason).toBe('budget_exhausted')
  })

  test('dollar budget exhaustion stops with reason cost_exhausted', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'hi' },
        { kind: 'usage', usage: { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    // 1000 output tokens at Sonnet ($15/M) ≈ $0.015 > $0.01 cap.
    const config = makeConfig({ budget: { maxSteps: 10, maxTokens: 100_000_000, maxCostUsd: 0.01 } })
    const rt = new ConversationRuntime(config, makeDeps(provider))
    const events = await collect(rt, 'go')

    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(done.reason).toBe('cost_exhausted')
  })

  test('emits a cost_warning event once when crossing the warn threshold', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'hi' },
        { kind: 'usage', usage: { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const config = makeConfig({ budget: { maxSteps: 10, maxTokens: 100_000_000, warnCostUsd: 0.005 } })
    const rt = new ConversationRuntime(config, makeDeps(provider))
    const events = await collect(rt, 'go')

    const warnings = events.filter((e) => e.kind === 'cost_warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ kind: 'cost_warning', thresholdUsd: 0.005 })
    const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
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

  test('passes permission mode into tool context', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'bash', input: { command: 'echo ok' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])

    let capturedCtx: ToolContext | undefined
    const tools: ToolRegistry = {
      list: () => [{ name: 'bash', description: 'bash', inputSchema: {} }],
      has: (n) => n === 'bash',
      execute: async (_name, _args, ctx) => {
        capturedCtx = ctx
        return { content: 'ok', isError: false }
      },
    }

    const rt = new ConversationRuntime(makeConfig(), {
      ...makeDeps(provider, tools),
      permissionMode: 'danger-full-access',
    })
    await collect(rt, 'run bash')

    expect(capturedCtx?.permissionMode).toBe('danger-full-access')
  })

  test('passes workspace root, tool requirements, and pre-hook override to rich enforcer', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'bash', input: { command: 'npm publish' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])

    const tools: ToolRegistry = {
      list: () => [{ name: 'bash', description: 'bash', inputSchema: {} }],
      has: (n) => n === 'bash',
      execute: async () => ({ content: 'ok', isError: false }),
    }
    const hookRunner = {
      runPreToolUse: async () => ({
        denied: false,
        failed: false,
        cancelled: false,
        messages: ['hook asked'],
        permissionOverride: 'ask' as const,
        permissionReason: 'needs confirmation',
      }),
      runPostToolUse: async () => ({ denied: false, failed: false, cancelled: false, messages: [] }),
      runPostToolUseFailure: async () => ({ denied: false, failed: false, cancelled: false, messages: [] }),
    } as unknown as HookRunner
    const requirements = { bash: 'danger-full-access' as const }
    let captured: Parameters<NonNullable<ConversationDeps['enforcer']>['enforce']>[1] | undefined
    const enforcer: NonNullable<ConversationDeps['enforcer']> = {
      enforce: async (_call, ctx) => {
        captured = ctx
        return { kind: 'allow' }
      },
    }

    const rt = new ConversationRuntime(makeConfig({ cwd: '/workspace/project' }), {
      ...makeDeps(provider, tools),
      hookRunner,
      enforcer,
      enforcerAskUser: async () => 'allow-once',
      enforcerToolRequirements: requirements,
      permissionMode: 'workspace-write',
    })
    await collect(rt, 'run bash')

    expect(captured?.workspaceRoot).toBe('/workspace/project')
    expect(captured?.toolRequirements).toBe(requirements)
    expect(captured?.hookOverride).toEqual({ decision: 'ask', reason: 'needs confirmation' })
  })

  test('denies outside-workspace write_file before executing the tool', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'write_file', input: { path: '../outside.txt', content: 'x' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [{ kind: 'finish', stopReason: 'end_turn' }],
    ])

    let executed = false
    const tools: ToolRegistry = {
      list: () => [{ name: 'write_file', description: 'write', inputSchema: {} }],
      has: (n) => n === 'write_file',
      execute: async () => {
        executed = true
        return { content: 'wrote', isError: false }
      },
    }
    const rt = new ConversationRuntime(makeConfig({ cwd: '/workspace/project' }), {
      ...makeDeps(provider, tools),
      enforcer: createEnforcer(),
      enforcerAskUser: async () => {
        throw new Error('askUser should not be called for boundary denial')
      },
      permissionMode: 'workspace-write',
    })

    const events = await collect(rt, 'write outside')
    const result = events.find((e) => e.kind === 'tool_result')

    expect(executed).toBe(false)
    expect(result).toMatchObject({
      kind: 'tool_result',
      result: { isError: true },
    })
    if (result?.kind === 'tool_result') {
      expect(result.result.content).toContain('outside workspace root')
    }
  })

  test('trims oversized tool output for the provider but keeps the full result on the event', async () => {
    const big = 'B'.repeat(5000)
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: {} } },
        { kind: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'usage', usage: { inputTokens: 8, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: big, isError: false }),
    }
    const rt = new ConversationRuntime(makeConfig({ toolOutputBudgetChars: 1000 }), makeDeps(provider, tools))
    const events = await collect(rt, 'read')

    const budgeted = events.find((e) => e.kind === 'tool_output_budgeted')
    expect(budgeted).toMatchObject({
      kind: 'tool_output_budgeted',
      toolCallId: 'tc1',
      originalChars: 5000,
      keptChars: 1000,
      droppedChars: 4000,
    })
    // Display/session event keeps the full result.
    const toolResult = events.find((e) => e.kind === 'tool_result')
    expect(toolResult).toMatchObject({ kind: 'tool_result', result: { content: big } })
    // Provider-bound message is trimmed.
    const toolMsg = rt.getFinalMessages().find((m) => m.role === 'tool')
    expect(toolMsg?.content.length).toBeLessThan(5000)
    expect(toolMsg?.content).toContain('trimmed')
  })

  test('persists the untrimmed original when tool output is budgeted', async () => {
    const big = 'B'.repeat(5000)
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: big, isError: false }),
    }
    const persisted: Array<{ path: string; content: string }> = []
    const deps = {
      ...makeDeps(provider, tools),
      persistToolOutput: async (path: string, content: string) => {
        persisted.push({ path, content })
      },
    }
    const rt = new ConversationRuntime(makeConfig({ toolOutputBudgetChars: 1000, cwd: '/repo' }), deps)
    await collect(rt, 'read')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]!.content).toBe(big)
    expect(persisted[0]!.path).toBe('/repo/.orchentra/sessions/test-session/tool-results/tc1.txt')
    // Provider-bound message points back at the same path it was persisted to.
    const toolMsg = rt.getFinalMessages().find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain(persisted[0]!.path)
  })

  test('does not emit a budget event when output is within budget', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'ok' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: 'small', isError: false }),
    }
    const rt = new ConversationRuntime(makeConfig({ toolOutputBudgetChars: 1000 }), makeDeps(provider, tools))
    const events = await collect(rt, 'read')
    expect(events.some((e) => e.kind === 'tool_output_budgeted')).toBe(false)
  })

  test('forwards provider tool-args-delta chunks as tool_args_delta runtime events', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-args-delta', toolUseId: 'tc1', toolName: 'read', partialJson: '{"path' },
        { kind: 'tool-args-delta', toolUseId: 'tc1', toolName: 'read', partialJson: '":"/a"}' },
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: { path: '/a' } } },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])

    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: 'file content', isError: false }),
    }

    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, tools))
    const events = await collect(rt, 'read file')

    const deltas = events.filter((e) => e.kind === 'tool_args_delta')
    expect(deltas).toEqual([
      { kind: 'tool_args_delta', toolUseId: 'tc1', toolName: 'read', partialJson: '{"path' },
      { kind: 'tool_args_delta', toolUseId: 'tc1', toolName: 'read', partialJson: '":"/a"}' },
    ])

    // Deltas precede tool_use finalization within the same turn.
    const lastDeltaIdx =
      events
        .map((e, i) => ({ e, i }))
        .filter((p) => p.e.kind === 'tool_args_delta')
        .pop()?.i ?? -1
    const toolUseIdx = events.findIndex((e) => e.kind === 'tool_use')
    expect(lastDeltaIdx).toBeGreaterThan(-1)
    expect(toolUseIdx).toBeGreaterThan(lastDeltaIdx)
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

  test('passes abort signal to the provider and finishes an in-flight abort', async () => {
    const controller = new AbortController()
    const provider: Provider = {
      stream(request): AsyncIterable<ProviderStreamEvent> {
        expect(request.signal).toBe(controller.signal)
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<ProviderStreamEvent>> {
                await new Promise<void>((_resolve, reject) => {
                  request.signal?.addEventListener('abort', () => reject(new Error('aborted by test')), { once: true })
                })
                return { done: true, value: undefined }
              },
            }
          },
        }
      },
    }
    const deps = { ...makeDeps(provider), signal: controller.signal }
    const rt = new ConversationRuntime(makeConfig(), deps)

    const collecting = collect(rt, 'hi')
    setTimeout(() => controller.abort(), 5)
    const events = await collecting

    expect(events.find((e) => e.kind === 'error')).toBeUndefined()
    expect(events.find((e) => e.kind === 'done')).toMatchObject({ kind: 'done', reason: 'aborted' })
  })

  test('emits span_start/span_end around each step', async () => {
    const provider = fakeProvider([
      [
        { kind: 'text-delta', delta: 'hi' },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider))
    const events = await collect(rt, 'hi')

    const spanStarts = events.filter((e) => e.kind === 'span_start')
    const spanEnds = events.filter((e) => e.kind === 'span_end')

    expect(spanStarts).toHaveLength(1)
    expect(spanEnds).toHaveLength(1)

    const start = spanStarts[0] as Extract<RuntimeEvent, { kind: 'span_start' }>
    const end = spanEnds[0] as Extract<RuntimeEvent, { kind: 'span_end' }>

    expect(start.name).toBe('step')
    expect(start.attributes?.step).toBe(1)
    expect(typeof start.spanId).toBe('string')
    expect(start.spanId.length).toBeGreaterThan(0)
    expect(typeof start.startedAt).toBe('string')
    expect(start.parentSpanId).toBeUndefined()

    expect(end.spanId).toBe(start.spanId)
    expect(end.status).toBe('ok')
    expect(typeof end.endedAt).toBe('string')
  })

  test('emits nested span around each tool call', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: { path: '/x' } } },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: 'ok', isError: false }),
    }
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, tools))
    const events = await collect(rt, 'hi')

    const stepStarts = events.filter(
      (e): e is Extract<RuntimeEvent, { kind: 'span_start' }> => e.kind === 'span_start' && e.name === 'step',
    )
    const toolStarts = events.filter(
      (e): e is Extract<RuntimeEvent, { kind: 'span_start' }> => e.kind === 'span_start' && e.name === 'tool_call',
    )
    const toolEnds = events.filter((e): e is Extract<RuntimeEvent, { kind: 'span_end' }> => e.kind === 'span_end')

    expect(stepStarts.length).toBeGreaterThanOrEqual(1)
    expect(toolStarts).toHaveLength(1)

    const toolStart = toolStarts[0]!
    expect(toolStart.attributes?.tool).toBe('read')
    expect(toolStart.attributes?.tool_call_id).toBe('tc1')
    expect(toolStart.parentSpanId).toBe(stepStarts[0]!.spanId)

    const toolEnd = toolEnds.find((e) => e.spanId === toolStart.spanId)
    expect(toolEnd).toBeDefined()
    expect(toolEnd!.status).toBe('ok')
  })

  test('tool failure marks span_end status=error', async () => {
    const provider = fakeProvider([
      [
        { kind: 'tool-use', call: { id: 'tc1', name: 'boom', input: {} } },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'boom', description: 'boom', inputSchema: {} }],
      has: () => true,
      execute: async () => ({ content: 'kaboom', isError: true }),
    }
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, tools))
    const events = await collect(rt, 'hi')

    const toolStart = events.find(
      (e): e is Extract<RuntimeEvent, { kind: 'span_start' }> => e.kind === 'span_start' && e.name === 'tool_call',
    )!
    const toolEnd = events.find(
      (e): e is Extract<RuntimeEvent, { kind: 'span_end' }> => e.kind === 'span_end' && e.spanId === toolStart.spanId,
    )!
    expect(toolEnd.status).toBe('error')
  })

  test('signed thinking blocks survive a tool-use continuation and stream as reasoning', async () => {
    const provider = fakeProvider([
      [
        { kind: 'thinking-delta', delta: 'inspect ' },
        { kind: 'thinking-delta', delta: 'the file' },
        { kind: 'thinking-signature', signature: 'sig-1' },
        { kind: 'tool-use', call: { id: 'tc1', name: 'read', input: { path: '/a' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read', inputSchema: {} }],
      has: () => true,
      execute: async () => ({ content: 'file content', isError: false }),
    }
    const rt = new ConversationRuntime(makeConfig(), makeDeps(provider, tools))
    const events = await collect(rt, 'go')

    const reasoning = events.filter((e): e is Extract<RuntimeEvent, { kind: 'reasoning' }> => e.kind === 'reasoning')
    expect(reasoning.map((e) => e.delta).join('')).toBe('inspect the file')

    const assistantWithTools = rt.getFinalMessages().find((m) => m.role === 'assistant' && m.toolCalls)
    expect(assistantWithTools?.thinking).toEqual([{ thinking: 'inspect the file', signature: 'sig-1' }])
  })

  test('an injected budget carries dollar spend across runs', async () => {
    let providerCalls = 0
    const provider: Provider = {
      async *stream() {
        providerCalls++
        yield { kind: 'text-delta', delta: 'hi' } as const
        // 1000 output tokens at sonnet ($15/M) = $0.015 > the $0.01 cap.
        yield {
          kind: 'usage',
          usage: { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 },
        } as const
        yield { kind: 'finish', stopReason: 'end_turn' } as const
      },
    }
    const config = makeConfig({
      model: 'sonnet',
      budget: { maxSteps: 10, maxTokens: 1_000_000_000, maxCostUsd: 0.01, model: 'sonnet' },
    })
    const budget = new RuntimeBudget(config.budget)
    const deps: ConversationDeps = { ...makeDeps(provider), budget }

    const first = await collect(new ConversationRuntime(config, deps), 'one')
    const firstDone = first.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(firstDone.reason).toBe('cost_exhausted')

    // Second turn: prior spend pushes the run over the cap before the provider
    // is ever called — the budget survived the turn boundary.
    const second = await collect(new ConversationRuntime(config, deps), 'two')
    const secondDone = second.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
    expect(secondDone.reason).toBe('cost_exhausted')
    expect(providerCalls).toBe(1)
  })

  test('an injected budget still resets the per-turn step guard', async () => {
    const turnEvents = (): ProviderStreamEvent[][] => [
      [
        { kind: 'tool-use', call: { id: `tc${Math.random()}`, name: 'ping', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ]
    const tools: ToolRegistry = {
      list: () => [{ name: 'ping', description: 'ping', inputSchema: {} }],
      has: () => true,
      execute: async () => ({ content: 'pong', isError: false }),
    }
    const config = makeConfig({ budget: { maxSteps: 3, maxTokens: 1_000_000 } })
    const budget = new RuntimeBudget(config.budget)

    // Each turn consumes 2 steps; with run-carried steps the second turn would
    // hit maxSteps 3. Both must finish with a clean stop.
    for (const label of ['one', 'two']) {
      const deps: ConversationDeps = { ...makeDeps(fakeProvider(turnEvents()), tools), budget }
      const events = await collect(new ConversationRuntime(config, deps), label)
      const done = events.find((e) => e.kind === 'done') as Extract<RuntimeEvent, { kind: 'done' }>
      expect(done.reason).toBe('stop')
    }
  })
})
