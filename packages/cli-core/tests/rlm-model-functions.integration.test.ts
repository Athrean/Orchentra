import { describe, expect, test } from 'bun:test'
import {
  CompletionPolicy,
  ConversationRuntime,
  RuntimeBudget,
  buildSystemPrompt,
  type ConversationConfig,
  type ConversationDeps,
} from '../src/runtime'
import type { RuntimeEvent, ToolEvidence } from '../src/runtime/events'
import type { Provider, ProviderRequest } from '../src/runtime/provider'
import type { ToolContext, ToolRegistry, ToolResult } from '../src/runtime/tools'
import type { TraceEvent, TraceManifest, TraceSink } from '../src/runtime/trace'

function config(overrides: Partial<ConversationConfig> = {}): ConversationConfig {
  return {
    model: 'root-model',
    maxOutputTokens: 1_024,
    contextWindowTokens: 100_000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 4,
    budget: { maxSteps: 10, maxTokens: 100_000, model: 'root-model' },
    sessionId: 'rlm-model-test',
    cwd: '/tmp',
    providerName: 'test',
    executionProfile: 'rlm',
    ...overrides,
  }
}

function traceCapture(): { sink: TraceSink; events: TraceEvent[]; manifests: TraceManifest[] } {
  const events: TraceEvent[] = []
  const manifests: TraceManifest[] = []
  return {
    sink: {
      append: (event) => events.push(event),
      finalize: (manifest) => manifests.push(manifest),
    },
    events,
    manifests,
  }
}

function rlmTools(proof?: ToolEvidence): ToolRegistry {
  return {
    list: () => [
      { name: 'rlm_execute', description: 'execute RLM code', inputSchema: { type: 'object' } },
      ...(proof ? [{ name: 'prove', description: 'produce evidence', inputSchema: { type: 'object' } }] : []),
    ],
    has: (name) => name === 'rlm_execute' || (Boolean(proof) && name === 'prove'),
    register: () => {},
    execute: async (name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> => {
      if (name === 'prove' && proof) {
        return {
          content: 'proof collected',
          isError: false,
          evidence: [proof],
          artifacts: [{ uri: '/tmp/proof.txt', kind: 'file', action: 'created' }],
        }
      }
      if (name !== 'rlm_execute' || !ctx.programEnvironment) {
        return { content: `unsupported tool: ${name}`, isError: true }
      }
      try {
        const execution = await ctx.programEnvironment.execute((args as { code: string }).code)
        return {
          content: JSON.stringify(execution.value),
          isError: false,
          data: execution,
          ...(execution.effects.images.length > 0 ? { images: [...execution.effects.images] } : {}),
          ...(execution.effects.evidence.length > 0 ? { evidence: [...execution.effects.evidence] } : {}),
          ...(execution.effects.artifacts.length > 0 ? { artifacts: [...execution.effects.artifacts] } : {}),
        }
      } catch (error) {
        return { content: error instanceof Error ? error.message : String(error), isError: true }
      }
    },
  }
}

function deps(provider: Provider, tools: ToolRegistry, trace: TraceSink, budget?: RuntimeBudget): ConversationDeps {
  return {
    provider,
    tools,
    systemPrompt: buildSystemPrompt({ staticParts: ['root policy'], trustedDynamicParts: ['root state'] }),
    traceSink: trace,
    persistToolOutput: async () => {},
    persistCompactionNote: async () => {},
    ...(budget ? { budget } : {}),
  }
}

async function collect(
  runtime: ConversationRuntime,
  input: string,
  completionPolicy?: CompletionPolicy,
): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = []
  for await (const event of runtime.run({ userMessage: input, completionPolicy })) events.push(event)
  return events
}

describe('RLM model functions through ConversationRuntime', () => {
  test('lm.query is tool-free, stores a result handle, and charges the shared live budget once', async () => {
    const requests: ProviderRequest[] = []
    let rootTurn = 0
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        if (request.tools.length === 0) {
          yield { kind: 'text-delta', delta: 'leaf answer' }
          yield {
            kind: 'usage',
            usage: { inputTokens: 7, outputTokens: 3, cacheReadTokens: 2, cacheCreationTokens: 0 },
          }
          yield { kind: 'finish', stopReason: 'end_turn' }
          return
        }
        if (rootTurn++ === 0) {
          yield {
            kind: 'usage',
            usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield {
            kind: 'tool-use',
            call: {
              id: 'root-execute',
              name: 'rlm_execute',
              input: {
                code: `(async () => lm.query('extract this', { model: 'leaf-model', maxOutputTokens: 128 }))()`,
              },
            },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        yield { kind: 'text-delta', delta: 'root done' }
        yield { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const budget = new RuntimeBudget(config().budget)
    const trace = traceCapture()
    const runtimeDeps = deps(provider, rlmTools(), trace.sink, budget)
    runtimeDeps.resolveNestedModel = (model) => ({ model, provider, providerName: 'test-leaf' })
    const runtime = new ConversationRuntime(config(), runtimeDeps)
    const events = await collect(runtime, 'root objective')

    expect(requests).toHaveLength(3)
    expect(requests[1]).toMatchObject({ model: 'leaf-model', maxOutputTokens: 128, tools: [] })
    expect(requests[1]!.systemStatic).toContain('bounded leaf model')
    const modelJobs = trace.events.filter((event) => event.kind === 'model_job')
    expect(modelJobs).toHaveLength(2)
    expect(modelJobs[1]).toMatchObject({
      kind: 'model_job',
      job: { callKind: 'leaf', status: 'completed', model: 'leaf-model', usage: { inputTokens: 7, outputTokens: 3 } },
    })
    const operation = trace.events.find(
      (event) => event.kind === 'program_operation' && event.operation.kind === 'lm.query',
    )
    expect(operation).toMatchObject({
      kind: 'program_operation',
      operation: { status: 'ok', result: { text: 'leaf answer', contextHandle: expect.stringMatching(/^ctx_/) } },
    })
    expect(events.find((event) => event.kind === 'done')).toMatchObject({
      kind: 'done',
      reason: 'stop',
      usage: { inputTokens: 9, outputTokens: 5, cacheReadTokens: 2, cacheCreationTokens: 0 },
    })
  })

  test('rlm.query uses a child runtime, propagates typed evidence, links its trace, and passes the parent gate', async () => {
    const requests: ProviderRequest[] = []
    let rootTurn = 0
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        const child = request.systemStatic.includes('bounded recursive child')
        if (child) {
          if (!request.messages.some((message) => message.role === 'tool')) {
            yield { kind: 'tool-use', call: { id: 'child-proof', name: 'prove', input: {} } }
            yield { kind: 'finish', stopReason: 'tool_use' }
            return
          }
          yield { kind: 'text-delta', delta: 'child answer' }
          yield { kind: 'finish', stopReason: 'end_turn' }
          return
        }
        if (rootTurn++ === 0) {
          yield {
            kind: 'tool-use',
            call: {
              id: 'root-recursive',
              name: 'rlm_execute',
              input: { code: `(async () => rlm.query('child investigation'))()` },
            },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        yield { kind: 'text-delta', delta: 'root complete' }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const proof: ToolEvidence = { kind: 'child-proof', summary: 'child verified the slice' }
    const trace = traceCapture()
    const runtime = new ConversationRuntime(config(), deps(provider, rlmTools(proof), trace.sink))
    const policy = new CompletionPolicy({
      obligations: [{ id: 'child-evidence', description: 'child proof exists', evidenceKinds: ['child-proof'] }],
      k: 1,
    })
    const events = await collect(runtime, 'root objective', policy)

    expect(requests.filter((request) => request.systemStatic.includes('bounded recursive child'))).toHaveLength(2)
    const outerResult = events.find(
      (event): event is Extract<RuntimeEvent, { kind: 'tool_result' }> =>
        event.kind === 'tool_result' && event.result.id === 'root-recursive',
    )
    expect(outerResult?.result.evidence).toEqual([proof])
    expect(outerResult?.result.artifacts).toEqual([{ uri: '/tmp/proof.txt', kind: 'file', action: 'created' }])
    expect(events.find((event) => event.kind === 'gate_decision')).toMatchObject({
      kind: 'gate_decision',
      decision: { outcome: 'pass', missingObligations: [] },
    })
    const parentManifest = trace.manifests.find((manifest) => manifest.task === 'root objective')
    const childManifest = trace.manifests.find((manifest) => manifest.task === 'child investigation')
    expect(childManifest).toBeDefined()
    expect(parentManifest?.subAgentTraceIds).toContain(childManifest!.traceId)
    expect(
      trace.events.find(
        (event) => event.kind === 'model_job' && event.job.callKind === 'recursive' && event.job.status === 'completed',
      ),
    ).toMatchObject({ kind: 'model_job', job: { traceId: childManifest!.traceId, contextHandle: expect.any(String) } })
  })

  test('propagates depth across child runtimes and refuses a third recursive level before provider dispatch', async () => {
    const requests: ProviderRequest[] = []
    let rootTurn = 0
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        const user = request.messages.filter((message) => message.role === 'user').at(-1)?.content
        const hasToolResult = request.messages.some((message) => message.role === 'tool')
        if (user === 'child-1' && !hasToolResult) {
          yield {
            kind: 'usage',
            usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield {
            kind: 'tool-use',
            call: { id: 'child-1-exec', name: 'rlm_execute', input: { code: `(async () => rlm.query('child-2'))()` } },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        if (user === 'child-2' && !hasToolResult) {
          yield {
            kind: 'usage',
            usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield {
            kind: 'tool-use',
            call: { id: 'child-2-exec', name: 'rlm_execute', input: { code: `(async () => rlm.query('too-deep'))()` } },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        if (user === 'child-2') {
          expect(request.messages.at(-1)?.content).toContain('depth cap reached (2)')
          yield { kind: 'text-delta', delta: 'depth correctly blocked' }
          yield {
            kind: 'usage',
            usage: { inputTokens: 3, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield { kind: 'finish', stopReason: 'end_turn' }
          return
        }
        if (user === 'child-1') {
          yield { kind: 'text-delta', delta: 'child one complete' }
          yield {
            kind: 'usage',
            usage: { inputTokens: 2, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield { kind: 'finish', stopReason: 'end_turn' }
          return
        }
        if (rootTurn++ === 0) {
          yield {
            kind: 'usage',
            usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield {
            kind: 'tool-use',
            call: { id: 'root-depth', name: 'rlm_execute', input: { code: `(async () => rlm.query('child-1'))()` } },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        yield { kind: 'text-delta', delta: 'root complete' }
        yield { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const trace = traceCapture()
    const runtime = new ConversationRuntime(config(), deps(provider, rlmTools(), trace.sink))
    const events = await collect(runtime, 'root-depth-objective')

    expect(requests).toHaveLength(6)
    expect(events.find((event) => event.kind === 'done')).toMatchObject({
      kind: 'done',
      reason: 'stop',
      usage: { inputTokens: 12, outputTokens: 8, cacheReadTokens: 0, cacheCreationTokens: 0 },
    })
    expect(
      trace.events.find(
        (event) =>
          event.kind === 'program_operation' &&
          event.operation.kind === 'rlm.query' &&
          event.operation.status === 'error',
      ),
    ).toMatchObject({
      kind: 'program_operation',
      operation: { error: expect.stringContaining('depth cap reached (2)') },
    })
    expect(
      trace.events.filter(
        (event) => event.kind === 'model_job' && event.job.callKind === 'recursive' && event.job.status === 'completed',
      ),
    ).toHaveLength(2)
  })

  test.each([false, true])('cancels and resumes a recursive child (wait for dispatch: %s)', async (waitForDispatch) => {
    const requests: ProviderRequest[] = []
    let rootTurn = 0
    let childDispatched!: () => void
    const dispatched = new Promise<void>((resolve) => {
      childDispatched = resolve
    })
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        const child = request.systemStatic.includes('bounded recursive child')
        const user = request.messages.filter((message) => message.role === 'user').at(-1)?.content
        if (child && user === 'first pass') {
          childDispatched()
          await waitForAbort(request.signal)
          return
        }
        if (child && user === 'second pass') {
          expect(request.messages.some((message) => message.content === 'first pass')).toBe(true)
          yield { kind: 'text-delta', delta: 'resumed child answer' }
          yield { kind: 'finish', stopReason: 'end_turn' }
          return
        }
        if (rootTurn++ === 0) {
          yield {
            kind: 'tool-use',
            call: {
              id: 'root-resume',
              name: 'rlm_execute',
              input: {
                code: `(async () => {
                  const job = await rlm.start('first pass')
                  ${waitForDispatch ? "await tools.call('await_child_dispatch', {})" : ''}
                  await jobs.cancel(job.jobId)
                  await jobs.resume(job.jobId, 'second pass')
                  return jobs.wait(job.jobId)
                })()`,
              },
            },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        yield { kind: 'text-delta', delta: 'root complete' }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const trace = traceCapture()
    const baseTools = rlmTools()
    const tools: ToolRegistry = {
      ...baseTools,
      list: () => [
        ...baseTools.list(),
        { name: 'await_child_dispatch', description: 'fixture synchronization', inputSchema: { type: 'object' } },
      ],
      has: (name) => name === 'await_child_dispatch' || baseTools.has(name),
      execute: async (name, args, ctx) => {
        if (name !== 'await_child_dispatch') return baseTools.execute(name, args, ctx)
        await dispatched
        return { content: 'child dispatched', isError: false }
      },
    }
    const runtime = new ConversationRuntime(config(), deps(provider, tools, trace.sink))
    const events = await collect(runtime, 'root resume objective')

    if (waitForDispatch) expect(requests).toHaveLength(4)
    else expect([3, 4]).toContain(requests.length) // Immediate cancellation may win the dispatch race.
    const lifecycle = trace.events
      .filter((event) => event.kind === 'model_job' && event.job.callKind === 'recursive')
      .map((event) => (event.kind === 'model_job' ? [event.job.status, event.job.attempt] : []))
    expect(lifecycle).toEqual([
      ['running', 1],
      ['cancelled', 1],
      ['running', 2],
      ['completed', 2],
    ])
    const result = events.find(
      (event): event is Extract<RuntimeEvent, { kind: 'tool_result' }> =>
        event.kind === 'tool_result' && event.result.id === 'root-resume',
    )
    expect(result?.result.content).toContain('resumed child answer')
    expect(result?.result.content).toContain('"attempt":2')
  })

  test('refuses a model function before provider dispatch when the shared budget is already exhausted', async () => {
    const requests: ProviderRequest[] = []
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        yield { kind: 'usage', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 } }
        yield {
          kind: 'tool-use',
          call: { id: 'root-budget', name: 'rlm_execute', input: { code: `(async () => lm.query('blocked'))()` } },
        }
        yield { kind: 'finish', stopReason: 'tool_use' }
      },
    }
    const limited = config({ budget: { maxSteps: 10, maxTokens: 2, model: 'root-model' } })
    const trace = traceCapture()
    const runtime = new ConversationRuntime(limited, deps(provider, rlmTools(), trace.sink))
    const events = await collect(runtime, 'budget objective')

    expect(requests).toHaveLength(1)
    expect(events.find((event) => event.kind === 'tool_result')).toMatchObject({
      kind: 'tool_result',
      result: { id: 'root-budget', isError: true, content: expect.stringContaining('Shared run budget exhausted') },
    })
    expect(events.find((event) => event.kind === 'done')).toMatchObject({ kind: 'done', reason: 'budget_exhausted' })
  })

  test('cancels unfinished async jobs before sealing the parent trace', async () => {
    const requests: ProviderRequest[] = []
    let rootTurn = 0
    const provider: Provider = {
      async *stream(request) {
        requests.push(captureRequest(request))
        if (request.tools.length === 0) {
          await waitForAbort(request.signal)
          return
        }
        if (rootTurn++ === 0) {
          yield {
            kind: 'tool-use',
            call: {
              id: 'root-unfinished',
              name: 'rlm_execute',
              input: { code: `(async () => lm.start('background leaf'))()` },
            },
          }
          yield { kind: 'finish', stopReason: 'tool_use' }
          return
        }
        yield { kind: 'text-delta', delta: 'root stops without waiting' }
        yield { kind: 'finish', stopReason: 'end_turn' }
      },
    }
    const trace = traceCapture()
    const runtime = new ConversationRuntime(config(), deps(provider, rlmTools(), trace.sink))
    await collect(runtime, 'unfinished objective')

    expect(requests).toHaveLength(3)
    expect(
      trace.events.find(
        (event) => event.kind === 'model_job' && event.job.callKind === 'leaf' && event.job.status === 'cancelled',
      ),
    ).toMatchObject({ kind: 'model_job', job: { doneReason: 'parent_closed', contextHandle: expect.any(String) } })
    const manifest = trace.manifests.find((entry) => entry.task === 'unfinished objective')
    expect(manifest?.eventCounts.model_job).toBe(2)
    expect(manifest?.doneReason).toBe('stop')
  })
})

function captureRequest(request: ProviderRequest): ProviderRequest {
  return {
    ...request,
    messages: structuredClone(request.messages),
    tools: structuredClone(request.tools),
    signal: undefined,
  }
}

function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}
