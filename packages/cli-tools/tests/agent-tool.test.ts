import { describe, expect, test } from 'bun:test'
import { RuntimeBudget } from '@orchentra/cli-core'
import type { Provider, ProviderRequest, ProviderStreamEvent, ToolContext, ToolRegistry } from '@orchentra/cli-core'
import { agentTool } from '../src/tools/agent-tool'

function fakeProvider(reply: string, usage = { inputTokens: 10, outputTokens: 5 }): Provider {
  return {
    async *stream(_req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      yield { kind: 'text-delta', delta: reply }
      yield {
        kind: 'usage',
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

const emptyToolRegistry: ToolRegistry = {
  list: () => [],
  has: () => false,
  execute: async () => ({ content: '', isError: true }),
  register: () => {},
}

function baseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: 'test',
    cwd: '/tmp',
    model: 'test-model',
    provider: fakeProvider('done'),
    tools: emptyToolRegistry,
    ...overrides,
  }
}

describe('agentTool', () => {
  test('errors when neither prompt nor tasks provided', async () => {
    const result = await agentTool.execute({}, baseCtx())
    expect(result.isError).toBe(true)
    expect(result.content).toContain('prompt')
  })

  test('runs a single prompt (backward compatible)', async () => {
    const result = await agentTool.execute({ prompt: 'do a thing' }, baseCtx({ provider: fakeProvider('all done') }))
    expect(result.isError).toBe(false)
    expect(result.content).toBe('all done')
  })

  test('fans out "tasks" concurrently and labels each result', async () => {
    const result = await agentTool.execute(
      { tasks: ['task a', 'task b'] },
      baseCtx({ provider: fakeProvider('finished') }),
    )
    expect(result.isError).toBe(false)
    expect(result.content).toContain('[task 1] finished')
    expect(result.content).toContain('[task 2] finished')
  })

  test('refuses to spawn when parent budget is already exhausted', async () => {
    const budget = new RuntimeBudget({ maxSteps: 1, maxTokens: 1000 })
    budget.tickStep()
    const result = await agentTool.execute({ prompt: 'do a thing' }, baseCtx({ budget }))
    expect(result.isError).toBe(true)
    expect(result.content).toContain('budget')
  })

  test('feeds sub-agent usage back into the parent budget', async () => {
    const budget = new RuntimeBudget({ maxSteps: 10, maxTokens: 1000 })
    const result = await agentTool.execute(
      { prompt: 'do a thing' },
      baseCtx({ provider: fakeProvider('ok', { inputTokens: 40, outputTokens: 10 }), budget }),
    )
    expect(result.isError).toBe(false)
    expect(budget.currentUsage.inputTokens).toBe(40)
    expect(budget.currentUsage.outputTokens).toBe(10)
  })

  test('stops mid-run once parent budget is exhausted by accumulated sub-agent spend', async () => {
    const budget = new RuntimeBudget({ maxSteps: 10, maxTokens: 30 })
    const result = await agentTool.execute(
      { prompt: 'do a thing' },
      baseCtx({ provider: fakeProvider('ok', { inputTokens: 40, outputTokens: 10 }), budget }),
    )
    expect(result.isError).toBe(false)
    expect(budget.snapshot().exhausted).toBe(true)
  })
})

function scriptedProvider(turns: ProviderStreamEvent[][]): Provider {
  let i = 0
  return {
    async *stream(_req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const turn = turns[i++] ?? []
      for (const ev of turn) yield ev
    },
  }
}

// Routes the `agent` tool back to itself (as the real registry does) and records
// the subagentDepth each nested invocation is called with.
function recursiveRegistry(depthLog: number[]): ToolRegistry {
  return {
    list: () => [],
    has: (n) => n === 'agent',
    register: () => {},
    execute: async (name, input, ctx) => {
      if (name !== 'agent') return { content: '', isError: true }
      depthLog.push(ctx.subagentDepth ?? -1)
      return agentTool.execute(input, ctx)
    },
  }
}

function concurrencyTrackingProvider(state: { current: number; max: number }): Provider {
  return {
    async *stream(_req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      state.current++
      state.max = Math.max(state.max, state.current)
      await new Promise((resolve) => setTimeout(resolve, 5))
      state.current--
      yield { kind: 'text-delta', delta: 'done' }
      yield {
        kind: 'usage',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

describe('agentTool fan-out concurrency cap', () => {
  test('never runs more than the concurrency cap of sub-agents at once', async () => {
    const state = { current: 0, max: 0 }
    const tasks = Array.from({ length: 8 }, (_, i) => `task ${i + 1}`)
    const result = await agentTool.execute(
      { tasks, justification: 'need all 8 checked in parallel' },
      baseCtx({ provider: concurrencyTrackingProvider(state) }),
    )
    expect(result.isError).toBe(false)
    expect(state.max).toBeLessThanOrEqual(4)
  })

  test('preserves task order in the result regardless of completion timing', async () => {
    const result = await agentTool.execute({ tasks: ['a', 'b', 'c'] }, baseCtx({ provider: fakeProvider('finished') }))
    expect(result.content.indexOf('[task 1]')).toBeLessThan(result.content.indexOf('[task 2]'))
    expect(result.content.indexOf('[task 2]')).toBeLessThan(result.content.indexOf('[task 3]'))
  })
})

describe('agentTool spawn-justification gate', () => {
  test('rejects fan-out beyond the threshold without a justification', async () => {
    const tasks = ['t1', 't2', 't3', 't4', 't5']
    const result = await agentTool.execute({ tasks }, baseCtx({ provider: fakeProvider('ok') }))
    expect(result.isError).toBe(true)
    expect(result.content).toContain('justification')
  })

  test('allows fan-out beyond the threshold when justification is provided', async () => {
    const tasks = ['t1', 't2', 't3', 't4', 't5']
    const result = await agentTool.execute(
      { tasks, justification: 'checking 5 independent modules, cannot combine' },
      baseCtx({ provider: fakeProvider('ok') }),
    )
    expect(result.isError).toBe(false)
  })

  test('does not require justification at or under the threshold', async () => {
    const tasks = ['t1', 't2', 't3', 't4']
    const result = await agentTool.execute({ tasks }, baseCtx({ provider: fakeProvider('ok') }))
    expect(result.isError).toBe(false)
  })
})

// Throws a 429-shaped error the first `failures` times a prompt is streamed,
// then behaves like fakeProvider. Mirrors a provider whose client-level
// retries exhausted under fan-out concurrency pressure.
function rateLimitedOnceProvider(rateLimitedPrompt: string, err: Error): Provider {
  const seen = new Map<string, number>()
  return {
    async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const prompt = typeof req.messages[0]?.content === 'string' ? req.messages[0].content : ''
      const count = (seen.get(prompt) ?? 0) + 1
      seen.set(prompt, count)
      if (prompt === rateLimitedPrompt && count === 1) throw err
      yield { kind: 'text-delta', delta: `ok:${prompt}` }
      yield {
        kind: 'usage',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

describe('agentTool rate-limit requeue', () => {
  test('requeues only the rate-limited task and the batch still succeeds', async () => {
    const err = new Error('deepseek API error: 429 too many requests')
    const result = await agentTool.execute(
      { tasks: ['task a', 'task b'] },
      baseCtx({ provider: rateLimitedOnceProvider('task b', err) }),
    )
    expect(result.isError).toBe(false)
    expect(result.content).toContain('[task 1] ok:task a')
    expect(result.content).toContain('[task 2] ok:task b')
  })

  test('does not retry non-rate-limit errors', async () => {
    let calls = 0
    const provider: Provider = {
      stream(): AsyncIterable<ProviderStreamEvent> {
        calls++
        throw new Error('boom')
      },
    }
    const result = await agentTool.execute({ tasks: ['task a'] }, baseCtx({ provider }))
    expect(result.isError).toBe(true)
    expect(result.content).toBe('agent error: boom')
    expect(calls).toBe(1)
  })

  test('a task that stays rate-limited reports the failure class and requeue count', async () => {
    let calls = 0
    const provider: Provider = {
      stream(): AsyncIterable<ProviderStreamEvent> {
        calls++
        throw new Error('Gemini API error 429: RESOURCE_EXHAUSTED')
      },
    }
    const result = await agentTool.execute({ tasks: ['task a'] }, baseCtx({ provider }))
    expect(result.isError).toBe(true)
    expect(result.content).toContain('429')
    expect(result.content).toContain('gave up after 2 requeue(s)')
    expect(calls).toBe(3)
  }, 10_000)

  test('does not requeue once the parent budget is exhausted', async () => {
    const budget = new RuntimeBudget({ maxSteps: 10, maxTokens: 20 })
    let bCalls = 0
    const provider: Provider = {
      async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
        const prompt = typeof req.messages[0]?.content === 'string' ? req.messages[0].content : ''
        if (prompt === 'task b') {
          bCalls++
          // Let task a's exhausting usage land before this failure surfaces.
          await new Promise((resolve) => setTimeout(resolve, 20))
          throw new Error('ollama API error: 429 too many requests')
        }
        yield { kind: 'text-delta', delta: 'ok:a' }
        yield {
          kind: 'usage',
          usage: { inputTokens: 30, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 },
        }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const result = await agentTool.execute({ tasks: ['task a', 'task b'] }, baseCtx({ provider, budget }))
    expect(budget.snapshot().exhausted).toBe(true)
    expect(result.isError).toBe(true)
    expect(bCalls).toBe(1)
  })
})

describe('agentTool recursion cap', () => {
  test('refuses to spawn when already at the recursion depth cap', async () => {
    const result = await agentTool.execute({ prompt: 'x' }, baseCtx({ subagentDepth: 2 }))
    expect(result.isError).toBe(true)
    expect(result.content).toContain('depth')
  })

  test('allows one nested level under the cap and increments depth for the child', async () => {
    const depthLog: number[] = []
    const turns: ProviderStreamEvent[][] = [
      [
        { kind: 'tool-use', call: { id: 'a1', name: 'agent', input: { prompt: 'inner' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'inner-ran' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
      [
        { kind: 'text-delta', delta: 'outer-done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ]
    const result = await agentTool.execute(
      { prompt: 'outer' },
      baseCtx({ provider: scriptedProvider(turns), tools: recursiveRegistry(depthLog) }),
    )
    expect(result.isError).toBe(false)
    expect(result.content).toBe('outer-done')
    // Root ctx is depth 0, so the spawned sub-agent runs its tool calls at depth 1.
    expect(depthLog).toEqual([1])
  })

  test('a sub-agent at the cap depth refuses to recurse further', async () => {
    const depthLog: number[] = []
    const turns: ProviderStreamEvent[][] = [
      [
        { kind: 'tool-use', call: { id: 'a1', name: 'agent', input: { prompt: 'too-deep' } } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'gave-up' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ]
    const result = await agentTool.execute(
      { prompt: 'deep' },
      baseCtx({ subagentDepth: 1, provider: scriptedProvider(turns), tools: recursiveRegistry(depthLog) }),
    )
    // Outer call is depth 1 → child runs at depth 2 → its nested agent call is refused.
    expect(result.isError).toBe(false)
    expect(result.content).toBe('gave-up')
    expect(depthLog).toEqual([2])
  })
})
