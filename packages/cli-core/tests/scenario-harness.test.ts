import { describe, expect, test } from 'bun:test'
import type { ProviderStreamEvent } from '../src/runtime/provider'
import type { ToolRegistry } from '../src/runtime/tools'
import { runScenario, assertScenario, type Scenario } from './support/scenario'

function textTurn(text: string, inputTokens: number, outputTokens: number): ProviderStreamEvent[] {
  return [
    { kind: 'text-delta', delta: text },
    { kind: 'usage', usage: { inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 } },
    { kind: 'finish', stopReason: 'end_turn' },
  ]
}

describe('scenario harness', () => {
  test('runs a scenario end-to-end and reports aggregated outcome', async () => {
    const scenario: Scenario = {
      name: 'streaming_text',
      input: 'hi',
      turns: [textTurn('hello world', 5, 2)],
      expect: {},
    }

    const result = await runScenario(scenario)

    expect(result.totalTokens).toBe(7)
    expect(result.transcript).toBe('hello world')
    expect(result.doneReason).toBe('stop')
  })

  test('cost gate: assertScenario throws when the run exceeds tokensMax', async () => {
    const scenario: Scenario = {
      name: 'over_budget',
      input: 'hi',
      turns: [textTurn('expensive answer', 50, 50)],
      expect: { tokensMax: 30 },
    }
    const result = await runScenario(scenario)
    expect(() => assertScenario(scenario, result)).toThrow(/tokensMax/)
  })

  test('assertScenario gates the transcript', async () => {
    const scenario: Scenario = {
      name: 'transcript',
      input: 'hi',
      turns: [textTurn('actual output', 5, 2)],
      expect: { transcript: 'expected output' },
    }
    const result = await runScenario(scenario)
    expect(() => assertScenario(scenario, result)).toThrow(/transcript/)
  })

  test('assertScenario gates the done reason', async () => {
    const scenario: Scenario = {
      name: 'done',
      input: 'hi',
      turns: [textTurn('hello', 5, 2)],
      expect: { done: 'max_steps' },
    }
    const result = await runScenario(scenario)
    expect(() => assertScenario(scenario, result)).toThrow(/done/)
  })

  test('assertScenario gates prefix-cache hits (cacheHitMin)', async () => {
    const scenario: Scenario = {
      name: 'cache_cold',
      input: 'hi',
      turns: [textTurn('hi', 5, 2)],
      expect: { cacheHitMin: 100 },
    }
    const result = await runScenario(scenario)
    expect(() => assertScenario(scenario, result)).toThrow(/cacheHitMin/)
  })

  test('full path: a cost-gated tool round-trip scenario satisfies every gate', async () => {
    const tools: ToolRegistry = {
      list: () => [{ name: 'read', description: 'read file', inputSchema: {} }],
      has: (n) => n === 'read',
      execute: async () => ({ content: 'file content', isError: false }),
    }
    const scenario: Scenario = {
      name: 'read_file_roundtrip',
      input: 'read /a',
      tools,
      turns: [
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
      ],
      expect: { transcript: 'done', done: 'stop', tokensMax: 30 },
    }
    const result = await runScenario(scenario)
    expect(() => assertScenario(scenario, result)).not.toThrow()
    expect(result.totalTokens).toBe(24)
  })
})
