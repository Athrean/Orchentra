import { describe, expect, test } from 'bun:test'
import {
  buildSystemPrompt,
  CompletionPolicy,
  ConversationRuntime,
  createEnforcer,
  HookRunner,
  RlmProgramEnvironment,
  RunContextStore,
  type Provider,
  type RuntimeEvent,
  type ToolContext,
  type ToolDefinition,
  type TraceEvent,
  type TraceManifest,
} from '@orchentra/cli-core'
import { DefaultToolRegistry } from '../src/tool-registry'
import { rlmExecuteTool } from '../src/tools/rlm-execute-tool'

describe('rlmExecuteTool', () => {
  test('fails closed when the program environment is absent', async () => {
    expect(await rlmExecuteTool.execute({ code: '1' }, { sessionId: 's', cwd: '/tmp' })).toEqual({
      content: 'RLM program environment unavailable outside the RLM execution profile',
      isError: true,
    })
  })

  test('returns program output and carries nested typed effects', async () => {
    const env = new RlmProgramEnvironment({
      contextStore: new RunContextStore('tool-program'),
      listTools: () => [],
      callTool: async () => ({
        id: 'nested',
        content: 'ok',
        isError: false,
        evidence: [{ kind: 'check', summary: 'passed' }],
      }),
    })
    const ctx: ToolContext = { sessionId: 's', cwd: '/tmp', programEnvironment: env }
    try {
      const result = await rlmExecuteTool.execute({ code: `(async () => tools.call('check'))()` }, ctx)
      expect(result.isError).toBe(false)
      expect(result.content).toContain('"content":"ok"')
      expect(result.evidence).toEqual([{ kind: 'check', summary: 'passed' }])
    } finally {
      await env.close()
    }
  })

  test('routes nested calls through the conversation permission and trace boundary', async () => {
    let dangerousExecutions = 0
    const dangerousTool: ToolDefinition = {
      name: 'dangerous_write',
      description: 'mutates host state',
      level: 'write',
      inputSchema: { type: 'object', additionalProperties: false },
      async execute() {
        dangerousExecutions++
        return { content: 'should not run', isError: false }
      },
    }
    const registry = new DefaultToolRegistry([rlmExecuteTool, dangerousTool])
    let modelStep = 0
    const provider: Provider = {
      async *stream() {
        if (modelStep++ === 0) {
          yield {
            kind: 'tool-use' as const,
            call: {
              id: 'outer-rlm',
              name: 'rlm_execute',
              input: { code: `(async () => tools.call('dangerous_write', {}))()` },
            },
          }
          yield { kind: 'finish' as const, stopReason: 'tool_use' as const }
          return
        }
        yield { kind: 'finish' as const, stopReason: 'end_turn' as const }
      },
    }
    const traceEvents: TraceEvent[] = []
    const observed: RuntimeEvent[] = []
    const runtime = new ConversationRuntime(
      {
        model: 'test',
        maxOutputTokens: 1_024,
        contextWindowTokens: 100_000,
        compactionThreshold: 0.7,
        keepRecentOnCompact: 4,
        budget: { maxSteps: 10, maxTokens: 100_000 },
        sessionId: 'rlm-permission-test',
        cwd: '/tmp',
        executionProfile: 'rlm',
      },
      {
        provider,
        tools: registry,
        systemPrompt: buildSystemPrompt({ staticParts: ['test'], dynamicParts: [] }),
        enforcer: createEnforcer(),
        enforcerAskUser: async () => 'deny',
        enforcerToolRequirements: registry.requirements(),
        permissionMode: 'read-only',
        traceSink: {
          append: (event) => traceEvents.push(event),
          finalize: () => {},
        },
        onEvent: (event) => observed.push(event),
      },
    )

    for await (const event of runtime.run({ userMessage: 'attempt a governed write' })) {
      // The yielded stream intentionally excludes nested events; trace/onEvent
      // are the complete recursive trajectory surfaces.
      void event
    }

    expect(dangerousExecutions).toBe(0)
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        kind: 'permission_decision',
        tool: 'dangerous_write',
        decision: 'deny',
      }),
    )
    expect(traceEvents).toContainEqual(
      expect.objectContaining({
        kind: 'program_operation',
        operation: expect.objectContaining({
          kind: 'tools.call',
          arguments: ['dangerous_write', {}],
          status: 'ok',
          result: expect.objectContaining({ isError: true }),
        }),
      }),
    )
    expect(observed.some((event) => event.kind === 'program_operation')).toBe(true)
  })

  test('preserves nested evidence for the existing completion gate', async () => {
    const verifyTool: ToolDefinition = {
      name: 'verify',
      description: 'verify the result',
      level: 'read',
      inputSchema: { type: 'object', additionalProperties: false },
      async execute() {
        return {
          content: 'verified',
          isError: false,
          evidence: [{ kind: 'exit-status', summary: 'exit code 0' }],
        }
      },
    }
    const registry = new DefaultToolRegistry([rlmExecuteTool, verifyTool])
    let modelStep = 0
    const provider: Provider = {
      async *stream() {
        if (modelStep++ === 0) {
          yield {
            kind: 'tool-use' as const,
            call: {
              id: 'outer-verify',
              name: 'rlm_execute',
              input: { code: `(async () => tools.call('verify', {}))()` },
            },
          }
          yield { kind: 'finish' as const, stopReason: 'tool_use' as const }
          return
        }
        yield { kind: 'finish' as const, stopReason: 'end_turn' as const }
      },
    }
    const runtime = new ConversationRuntime(
      {
        model: 'test',
        maxOutputTokens: 1_024,
        contextWindowTokens: 100_000,
        compactionThreshold: 0.7,
        keepRecentOnCompact: 4,
        budget: { maxSteps: 10, maxTokens: 100_000 },
        sessionId: 'rlm-gate-test',
        cwd: '/tmp',
        executionProfile: 'rlm',
      },
      {
        provider,
        tools: registry,
        systemPrompt: buildSystemPrompt({ staticParts: ['test'], dynamicParts: [] }),
        traceSink: { append: () => {}, finalize: () => {} },
      },
    )
    const events: RuntimeEvent[] = []
    const completionPolicy = new CompletionPolicy({
      obligations: [{ id: 'verify', description: 'verification succeeds', evidenceKinds: ['exit-status'] }],
      k: 1,
    })
    for await (const event of runtime.run({ userMessage: 'verify recursively', completionPolicy })) {
      events.push(event)
    }

    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'gate_decision', decision: expect.objectContaining({ outcome: 'pass' }) }),
    )
    expect(events.find((event) => event.kind === 'done')?.reason).toBe('stop')
  })

  test.each([false, true])(
    'safe streamed calls execute once and respect outer-hook effects (hook=%s)',
    async (outerHook) => {
      let executions = 0
      let state = 0
      const hookRunner = new (class extends HookRunner {
        override allowsSpeculativeTool(name: string): boolean {
          return !outerHook || name !== 'rlm_execute'
        }
        override async runPreToolUse(name: string, input: string): ReturnType<HookRunner['runPreToolUse']> {
          if (outerHook && name === 'rlm_execute') state++
          return super.runPreToolUse(name, input)
        }
      })()
      const safeTool: ToolDefinition = {
        name: 'safe_read',
        description: 'deterministic read',
        level: 'read',
        scheduling: {
          pure: true,
          idempotent: true,
          concurrencySafe: true,
          speculativeSafe: true,
          resourceClass: 'filesystem',
        },
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: false,
        },
        async execute() {
          executions++
          const value = state
          await new Promise((resolve) => setTimeout(resolve, 5))
          return { content: `safe result ${value}`, isError: false }
        },
      }
      const registry = new DefaultToolRegistry([rlmExecuteTool, safeTool])
      const code = '(async () => await tools.call("safe_read", {"id":1}))()'
      let modelStep = 0
      const provider: Provider = {
        async *stream() {
          if (modelStep++ === 0) {
            yield {
              kind: 'tool-args-delta' as const,
              toolUseId: 'outer-spec',
              toolName: 'rlm_execute',
              partialJson: JSON.stringify({ code }),
            }
            await new Promise((resolve) => setTimeout(resolve, 10))
            yield {
              kind: 'tool-use' as const,
              call: { id: 'outer-spec', name: 'rlm_execute', input: { code } },
            }
            yield { kind: 'finish' as const, stopReason: 'tool_use' as const }
            return
          }
          yield { kind: 'text-delta' as const, delta: 'done' }
          yield { kind: 'finish' as const, stopReason: 'end_turn' as const }
        },
      }
      const observed: RuntimeEvent[] = []
      let manifest: TraceManifest | undefined
      const runtime = new ConversationRuntime(
        {
          model: 'test',
          maxOutputTokens: 1_024,
          contextWindowTokens: 100_000,
          compactionThreshold: 0.7,
          keepRecentOnCompact: 4,
          budget: { maxSteps: 10, maxTokens: 100_000 },
          sessionId: 'rlm-speculation-test',
          cwd: '/tmp',
          executionProfile: 'rlm',
          speculativeToolCalls: true,
        },
        {
          provider,
          tools: registry,
          hookRunner,
          systemPrompt: buildSystemPrompt({ staticParts: ['test'], dynamicParts: [] }),
          traceSink: {
            append: () => {},
            finalize: (value) => {
              manifest = value
            },
          },
          onEvent: (event) => observed.push(event),
        },
      )
      for await (const event of runtime.run({ userMessage: 'read speculatively' })) void event

      expect(executions).toBe(1)
      expect(manifest!.optimization!.scheduler!.submitted).toBe(1)
      expect(manifest!.optimization!.speculation.matched).toBe(outerHook ? 0 : 1)
      expect(manifest!.optimization!.speculation.extraComputeMs).toBe(0)
      if (outerHook) {
        expect(observed.filter((event) => event.kind === 'speculative_tool')).toHaveLength(0)
      } else {
        expect(observed).toContainEqual(
          expect.objectContaining({
            kind: 'speculative_tool',
            attempt: expect.objectContaining({ toolName: 'safe_read', status: 'matched', extraComputeMs: 0 }),
          }),
        )
      }
      const result = observed.find((event) => event.kind === 'tool_result' && event.result.id === 'outer-spec')
      expect(result?.kind === 'tool_result' && result.result.content).toContain(`safe result ${outerHook ? 1 : 0}`)
      expect(observed.filter((event) => event.kind === 'tool_use' && event.call.name === 'safe_read')).toHaveLength(1)
    },
  )

  test.each(['ordered', 'reordered'] as const)(
    'a %s batch never reuses a read from before an earlier write',
    async (order) => {
      let state = 0
      const operations: string[] = []
      const registry = new DefaultToolRegistry([
        rlmExecuteTool,
        {
          name: 'safe_read',
          description: 'read state',
          level: 'read',
          inputSchema: { type: 'object' },
          scheduling: {
            pure: true,
            idempotent: true,
            concurrencySafe: true,
            speculativeSafe: true,
            resourceClass: 'filesystem',
          },
          async execute() {
            const value = state
            await new Promise((resolve) => setTimeout(resolve, 5))
            operations.push(`read:${value}`)
            return { content: String(value), isError: false }
          },
        },
        {
          name: 'write_state',
          description: 'write state',
          level: 'write',
          inputSchema: { type: 'object' },
          async execute() {
            operations.push('write')
            state++
            return { content: 'written', isError: false }
          },
        },
      ])
      const code = '(async () => tools.call("safe_read", {}))()'
      let step = 0
      const observed: RuntimeEvent[] = []
      const runtime = new ConversationRuntime(
        {
          model: 'test',
          maxOutputTokens: 1024,
          contextWindowTokens: 100_000,
          compactionThreshold: 0.7,
          keepRecentOnCompact: 4,
          budget: { maxSteps: 10, maxTokens: 100_000 },
          sessionId: 'spec-order',
          cwd: '/tmp',
          executionProfile: 'rlm',
          speculativeToolCalls: true,
        },
        {
          provider: {
            async *stream() {
              if (step++ === 0) {
                if (order === 'ordered') {
                  yield { kind: 'tool-args-delta', toolUseId: 'write', toolName: 'write_state', partialJson: '{}' }
                }
                yield {
                  kind: 'tool-args-delta',
                  toolUseId: 'read',
                  toolName: 'rlm_execute',
                  partialJson: JSON.stringify({ code }),
                }
                yield { kind: 'tool-use', call: { id: 'write', name: 'write_state', input: {} } }
                yield { kind: 'tool-use', call: { id: 'read', name: 'rlm_execute', input: { code } } }
                yield { kind: 'finish', stopReason: 'tool_use' }
              } else {
                yield { kind: 'finish', stopReason: 'end_turn' }
              }
            },
          },
          tools: registry,
          systemPrompt: buildSystemPrompt({ staticParts: ['test'], dynamicParts: [] }),
          onEvent: (event) => {
            observed.push(event)
          },
        },
      )
      for await (const event of runtime.run({ userMessage: 'write then read' })) void event
      expect(operations).toEqual(order === 'ordered' ? ['write', 'read:1'] : ['read:0', 'write', 'read:1'])
      const result = observed.find((event) => event.kind === 'tool_result' && event.result.id === 'read')
      expect(result?.kind === 'tool_result' && result.result.content).toContain('"content":"1"')
      expect(
        observed.filter((event) => event.kind === 'speculative_tool' && event.attempt.status === 'matched'),
      ).toHaveLength(0)
    },
  )
})
