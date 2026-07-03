import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSystemPrompt,
  ConversationRuntime,
  createEnforcer,
  type ConversationConfig,
  type Provider,
  type ProviderRequest,
  type ProviderStreamEvent,
  type RuntimeEvent,
  type SharedToolState,
} from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'

function fakeProvider(responses: ProviderStreamEvent[][], onRequest?: (request: ProviderRequest) => void): Provider {
  let callIndex = 0
  return {
    async *stream(request) {
      onRequest?.(request)
      const resp = responses[callIndex++] ?? []
      for (const ev of resp) yield ev
    },
  }
}

function config(cwd: string, overrides: Partial<ConversationConfig> = {}): ConversationConfig {
  return {
    model: 'test-model',
    maxOutputTokens: 1024,
    contextWindowTokens: 100_000,
    compactionThreshold: 0.7,
    keepRecentOnCompact: 4,
    toolOutputBudgetChars: 120,
    budget: { maxSteps: 10, maxTokens: 100_000 },
    sessionId: 'harness-session',
    cwd,
    ...overrides,
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

async function collect(runtime: ConversationRuntime, input: string): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = []
  for await (const event of runtime.run({ userMessage: input })) events.push(event)
  return events
}

describe('deterministic harness scenarios', () => {
  test('drives real registry tools through runtime permission, workspace, and output-budget gates', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orchentra-harness-runtime-'))
    const workspace = join(root, 'workspace')
    try {
      mkdirSync(workspace, { recursive: true })
      writeFileSync(join(workspace, 'large.txt'), 'alpha '.repeat(80))
      const outsidePath = join(root, 'outside.txt')
      const registry = new DefaultToolRegistry()
      const provider = fakeProvider([
        [
          { kind: 'tool-use', call: { id: 'read-1', name: 'read_file', input: { path: 'large.txt' } } },
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [
          {
            kind: 'tool-use',
            call: { id: 'write-1', name: 'write_file', input: { path: '../outside.txt', content: 'unsafe' } },
          },
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        [{ kind: 'finish', stopReason: 'end_turn' }],
      ])

      const runtime = new ConversationRuntime(config(workspace), {
        provider,
        tools: registry,
        systemPrompt: buildSystemPrompt({ staticParts: ['test harness'], dynamicParts: [] }),
        enforcer: createEnforcer(),
        enforcerAskUser: async () => {
          throw new Error('workspace boundary denial should not prompt')
        },
        enforcerToolRequirements: registry.requirements(),
        permissionMode: 'workspace-write',
      })

      const events = await collect(runtime, 'exercise real tools')
      const budgeted = events.find(
        (event): event is Extract<RuntimeEvent, { kind: 'tool_output_budgeted' }> =>
          event.kind === 'tool_output_budgeted',
      )
      expect(budgeted).toMatchObject({ toolCallId: 'read-1', keptChars: 120 })
      expect(budgeted?.droppedChars).toBeGreaterThan(0)

      const results = events.filter(
        (event): event is Extract<RuntimeEvent, { kind: 'tool_result' }> => event.kind === 'tool_result',
      )
      expect(results[0]?.result).toMatchObject({ id: 'read-1', isError: false })
      expect(results[0]?.result.content).toBe('alpha '.repeat(80))
      expect(results[1]?.result).toMatchObject({ id: 'write-1', isError: true })
      expect(results[1]?.result.content).toContain('outside workspace root')
      expect(existsSync(outsidePath)).toBe(false)

      const providerReadResult = runtime.getFinalMessages().find((message) => message.toolCallId === 'read-1')
      expect(providerReadResult?.content.length).toBeLessThan('alpha '.repeat(80).length)
      expect(providerReadResult?.content).toContain('trimmed')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('passes active spine budget controls into LiveCli and accounts usage by terse mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orchentra-harness-live-'))
    const requests: ProviderRequest[] = []
    try {
      const provider = fakeProvider(
        [
          [
            { kind: 'text-delta', delta: 'done' },
            { kind: 'usage', usage: { inputTokens: 12, outputTokens: 7, cacheReadTokens: 0, cacheCreationTokens: 0 } },
            { kind: 'finish', stopReason: 'end_turn' },
          ],
        ],
        (request) => requests.push(request),
      )
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'test-model',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd,
        sessionId: 'live-harness-session',
        sharedState: sharedState(),
      })
      cli.setEventSink(() => {})
      cli.setTerseMode('ultra')
      cli.setBudgetControls({
        maxCostUsd: 2,
        warnCostUsd: 1,
        toolOutputBudgetChars: 1234,
        compactionThreshold: 0.25,
        keepRecentOnCompact: 2,
      })

      await cli.runTurn('show active spine controls')

      expect(requests).toHaveLength(1)
      expect(requests[0]?.systemStatic).toContain('tool_output=1234 chars')
      expect(requests[0]?.systemStatic).toContain('compact_at=25%')
      expect(requests[0]?.systemStatic).toContain('keep_recent=2')
      expect(requests[0]?.systemStatic).toContain('cap=$2')
      expect(requests[0]?.systemStatic).toContain('warn=$1')
      expect(requests[0]?.systemStatic).toContain('TERSE OUTPUT MODE')
      expect(requests[0]?.systemStatic).toContain('maximally terse')

      expect(cli.getBudgetControls()).toMatchObject({
        maxCostUsd: 2,
        warnCostUsd: 1,
        toolOutputBudgetChars: 1234,
        compactionThreshold: 0.25,
        keepRecentOnCompact: 2,
      })
      expect(cli.getTerseBreakdown()).toEqual([{ mode: 'ultra', outputTokens: 7, turns: 1 }])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
