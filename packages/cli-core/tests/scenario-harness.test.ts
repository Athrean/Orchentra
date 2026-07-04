import { describe, expect, test } from 'bun:test'
import { agentTool } from '../../cli-tools/src/tools/agent-tool'
import type { RuntimeEvent } from '../src/runtime/events'
import type { ProviderRequest, ProviderStreamEvent } from '../src/runtime/provider'
import type { ToolContext, ToolDefinition, ToolRegistry, ToolResult } from '../src/runtime/tools'
import { runScenario, assertScenario, type Scenario } from './support/scenario'

function usage(inputTokens: number, outputTokens: number): ProviderStreamEvent {
  return {
    kind: 'usage',
    usage: { inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 },
  }
}

function textTurn(text: string, inputTokens: number, outputTokens: number): ProviderStreamEvent[] {
  return [
    { kind: 'text-delta', delta: text },
    usage(inputTokens, outputTokens),
    { kind: 'finish', stopReason: 'end_turn' },
  ]
}

function waitForSignal(signal: Promise<void>, timeoutMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), 100)
    signal.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

interface AgentExecution {
  depth: number
  result: ToolResult
}

const markerTool: ToolDefinition = {
  name: 'marker',
  description: 'Test-only marker tool for sub-agent scenario loops',
  level: 'read',
  inputSchema: { type: 'object', additionalProperties: false },
  execute: async () => ({ content: 'marked', isError: false }),
}

function agentScenarioTools(onAgentResult?: (execution: AgentExecution) => void): ToolRegistry {
  const tools = new Map<string, ToolDefinition>([
    [agentTool.name, agentTool],
    [markerTool.name, markerTool],
  ])

  return {
    list: () =>
      Array.from(tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    has: (name) => tools.has(name),
    execute: async (name: string, args: unknown, ctx: ToolContext) => {
      const tool = tools.get(name)
      if (!tool) return { content: `unsupported tool: ${name}`, isError: true }
      const result = await tool.execute(args, ctx)
      if (name === agentTool.name) onAgentResult?.({ depth: ctx.subagentDepth ?? 0, result })
      return result
    },
    register: (tool) => {
      tools.set(tool.name, tool)
    },
  }
}

function toolResult(events: RuntimeEvent[], id: string): ToolResult | undefined {
  const event = events.find(
    (event): event is Extract<RuntimeEvent, { kind: 'tool_result' }> =>
      event.kind === 'tool_result' && event.result.id === id,
  )
  return event?.result
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

  test('agent scenario: budget inheritance stops a sub-agent mid-run when child spend exhausts the parent', async () => {
    const requests: ProviderRequest[] = []
    const scenario: Scenario = {
      name: 'agent_budget_inheritance_mid_run_exhaustion',
      input: 'delegate expensive work',
      tools: agentScenarioTools(),
      config: { budget: { maxSteps: 10, maxTokens: 30 } },
      turns: [
        [
          { kind: 'tool-use', call: { id: 'agent-budget', name: 'agent', input: { prompt: 'spend until capped' } } },
          usage(3, 2),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [
          { kind: 'tool-use', call: { id: 'marker-1', name: 'marker', input: {} } },
          usage(28, 0),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        textTurn('unreachable after inherited budget exhaustion', 1, 1),
      ],
      onProviderRequest: (request) => requests.push(request),
      expect: { done: 'budget_exhausted', tokensMax: 33 },
    }

    const result = await runScenario(scenario)

    expect(() => assertScenario(scenario, result)).not.toThrow()
    expect(result.doneReason).toBe('budget_exhausted')
    expect(result.totalTokens).toBe(33)
    expect(requests).toHaveLength(2)
    expect(toolResult(result.events, 'agent-budget')?.content).toContain('parent budget exhausted after 1 tool call(s)')
  })

  test('agent scenario: tasks fan out into independent sub-agent provider turns and labelled results', async () => {
    const requests: ProviderRequest[] = []
    let activeSubagentTurns = 0
    let maxActiveSubagentTurns = 0
    let resolveSecondSubagentStarted: () => void = () => {}
    const secondSubagentStarted = new Promise<void>((resolve) => {
      resolveSecondSubagentStarted = resolve
    })
    const scenario: Scenario = {
      name: 'agent_parallel_tasks_fanout',
      input: 'fan out two independent checks',
      tools: agentScenarioTools(),
      turns: [
        [
          {
            kind: 'tool-use',
            call: {
              id: 'agent-tasks',
              name: 'agent',
              input: { tasks: ['inspect api package', 'inspect cli package'] },
            },
          },
          usage(2, 1),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        textTurn('api ok', 4, 1),
        textTurn('cli ok', 6, 1),
        textTurn('fanout complete', 3, 1),
      ],
      onProviderRequest: (request) => requests.push(request),
      beforeProviderTurn: async (_request, callIndex) => {
        if (callIndex !== 1 && callIndex !== 2) return
        activeSubagentTurns += 1
        maxActiveSubagentTurns = Math.max(maxActiveSubagentTurns, activeSubagentTurns)
        if (callIndex === 2) resolveSecondSubagentStarted()
        if (callIndex === 1) {
          await waitForSignal(secondSubagentStarted, 'second sub-agent stream did not start before first completed')
        }
      },
      afterProviderTurn: (_request, callIndex) => {
        if (callIndex !== 1 && callIndex !== 2) return
        activeSubagentTurns -= 1
      },
      expect: { transcript: 'fanout complete', done: 'stop', tokensMax: 19 },
    }

    const result = await runScenario(scenario)

    expect(() => assertScenario(scenario, result)).not.toThrow()
    expect(result.totalTokens).toBe(19)
    expect(requests).toHaveLength(4)
    expect(requests[1]?.messages).toEqual([{ role: 'user', content: 'inspect api package' }])
    expect(requests[2]?.messages).toEqual([{ role: 'user', content: 'inspect cli package' }])
    expect(maxActiveSubagentTurns).toBe(2)
    expect(toolResult(result.events, 'agent-tasks')?.content).toBe('[task 1] api ok\n\n[task 2] cli ok')
  })

  test('agent scenario: nested delegation refuses once recursion depth reaches the cap', async () => {
    const agentExecutions: AgentExecution[] = []
    const scenario: Scenario = {
      name: 'agent_recursion_depth_refusal',
      input: 'delegate recursively',
      tools: agentScenarioTools((execution) => agentExecutions.push(execution)),
      turns: [
        [
          { kind: 'tool-use', call: { id: 'agent-root', name: 'agent', input: { prompt: 'level 1' } } },
          usage(1, 0),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [
          { kind: 'tool-use', call: { id: 'agent-level-2', name: 'agent', input: { prompt: 'level 2' } } },
          usage(1, 0),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [
          { kind: 'tool-use', call: { id: 'agent-too-deep', name: 'agent', input: { prompt: 'level 3' } } },
          usage(1, 0),
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        textTurn('level 2 recovered', 1, 0),
        textTurn('level 1 done', 1, 0),
        textTurn('root done', 1, 0),
      ],
      expect: { transcript: 'root done', done: 'stop', tokensMax: 6 },
    }

    const result = await runScenario(scenario)

    expect(() => assertScenario(scenario, result)).not.toThrow()
    expect(agentExecutions.map((execution) => execution.depth)).toEqual([2, 1, 0])
    expect(agentExecutions[0]?.result.isError).toBe(true)
    expect(agentExecutions[0]?.result.content).toContain('recursion depth cap')
    expect(toolResult(result.events, 'agent-root')?.content).toBe('level 1 done')
  })
})
