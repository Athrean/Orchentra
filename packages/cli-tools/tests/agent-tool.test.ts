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
