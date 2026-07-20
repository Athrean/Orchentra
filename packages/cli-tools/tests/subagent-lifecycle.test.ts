import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeBudget } from '@orchentra/cli-core'
import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  ToolContext,
  ToolRegistry,
  ToolResult,
} from '@orchentra/cli-core'
import { agentTool } from '../src/tools/agent-tool'
import { agentControlTool, resetChildRegistryForTests, type ChildTranscript } from '../src/tools/subagent-lifecycle'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

/** Call-indexed provider that records every request it serves. */
function sequencedProvider(turns: ProviderStreamEvent[][]): { provider: Provider; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = []
  let index = 0
  const provider: Provider = {
    async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      requests.push(req)
      const turn = turns[index++] ?? [
        { kind: 'text-delta', delta: 'script exhausted' },
        { kind: 'finish', stopReason: 'end_turn' },
      ]
      for (const ev of turn) yield ev
    },
  }
  return { provider, requests }
}

function registryWith(tools: Record<string, (args: unknown, ctx: ToolContext) => Promise<ToolResult>>): ToolRegistry {
  return {
    list: () => Object.keys(tools).map((name) => ({ name, description: name, inputSchema: { type: 'object' } })),
    has: (name) => name in tools,
    register: () => {},
    execute: async (name, args, ctx) => tools[name]?.(args, ctx) ?? { content: `unsupported: ${name}`, isError: true },
  }
}

function ctxIn(cwd: string, provider: Provider, tools: ToolRegistry, budget?: RuntimeBudget): ToolContext {
  return { sessionId: 'lifecycle-test', cwd, model: 'test-model', provider, tools, budget }
}

async function readTranscript(cwd: string, id: string): Promise<ChildTranscript> {
  return JSON.parse(await readFile(join(cwd, '.orchentra', 'subagents', `${id}.json`), 'utf8')) as ChildTranscript
}

/** Polls the persisted transcript until it reaches `status` (writes are async). */
async function transcriptAtStatus(cwd: string, id: string, status: string): Promise<ChildTranscript> {
  for (let i = 0; i < 50; i++) {
    try {
      const record = await readTranscript(cwd, id)
      if (record.status === status) return record
    } catch {
      // not written yet
    }
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`transcript for ${id} never reached status ${status}`)
}

let dir: string
afterEach(async () => {
  resetChildRegistryForTests()
  if (dir) await rm(dir, { recursive: true, force: true })
})

describe('background children: steer mid-run, wait to completion (M6 exit criterion)', () => {
  test('a backgrounded child is steered mid-run and resumed to completion', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const gate = deferred()
    const { provider, requests } = sequencedProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'slow', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'finished with steering applied' },
        { kind: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools = registryWith({
      slow: async () => {
        await gate.promise
        return { content: 'slow done', isError: false }
      },
    })
    const ctx = ctxIn(dir, provider, tools)

    // Spawn returns immediately while the child sits inside its first tool call.
    const spawn = await agentTool.execute({ prompt: 'long build task', background: true }, ctx)
    expect(spawn.isError).toBe(false)
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!

    // Steer while the child is mid-run (blocked in the slow tool).
    const steered = await agentControlTool.execute(
      { action: 'steer', agentId: id, instruction: 'ship only the fix' },
      ctx,
    )
    expect(steered.isError).toBe(false)

    gate.resolve()
    const waited = await agentControlTool.execute({ action: 'wait', agentId: id }, ctx)
    expect(waited.isError).toBe(false)
    expect(waited.content).toBe('finished with steering applied')

    // The steering instruction reached the model on the next step.
    expect(requests[1]!.messages.some((m) => m.role === 'user' && m.content === 'ship only the fix')).toBe(true)

    // Durable transcript: completed, with the steering in the message history
    // and per-child cost accounted.
    const transcript = await transcriptAtStatus(dir, id, 'completed')
    expect(transcript.messages.some((m) => m.role === 'user' && m.content === 'ship only the fix')).toBe(true)
    expect(transcript.doneReason).toBe('stop')
    expect(transcript.usage?.inputTokens).toBe(10)
    expect(typeof transcript.costUsd).toBe('number')
  }, 15_000)

  test('steering a finished child is refused with a pointer to resume', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const { provider } = sequencedProvider([
      [
        { kind: 'text-delta', delta: 'done immediately' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const ctx = ctxIn(dir, provider, registryWith({}))
    const spawn = await agentTool.execute({ prompt: 'quick task', background: true }, ctx)
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!
    await agentControlTool.execute({ action: 'wait', agentId: id }, ctx)

    const steered = await agentControlTool.execute({ action: 'steer', agentId: id, instruction: 'more' }, ctx)
    expect(steered.isError).toBe(true)
    expect(steered.content).toContain('resume')
  })
})

describe('suspended children resume from the persisted transcript', () => {
  test('a budget-suspended child resumes across a registry reset (process boundary) and completes', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const { provider, requests } = sequencedProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'ping', input: {} } },
        { kind: 'usage', usage: { inputTokens: 40, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0 } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'resumed and finished' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools = registryWith({ ping: async () => ({ content: 'pong', isError: false }) })

    // Tiny parent budget: the child aborts after its first step → suspended.
    const spawnBudget = new RuntimeBudget({ maxSteps: 10, maxTokens: 30 })
    const spawn = await agentTool.execute(
      { prompt: 'interrupted task', background: true },
      ctxIn(dir, provider, tools, spawnBudget),
    )
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!
    const suspended = await transcriptAtStatus(dir, id, 'suspended')
    expect(suspended.doneReason).toBe('aborted')
    expect(suspended.runState).toBeDefined()
    expect(suspended.messages.length).toBeGreaterThan(0)

    // New "process": in-memory registry gone, only the transcript remains.
    resetChildRegistryForTests()

    const freshCtx = ctxIn(dir, provider, tools, new RuntimeBudget({ maxSteps: 10, maxTokens: 100000 }))
    const resumed = await agentControlTool.execute(
      { action: 'resume', agentId: id, instruction: 'pick up where you stopped' },
      freshCtx,
    )
    expect(resumed.isError).toBe(false)

    const waited = await agentControlTool.execute({ action: 'wait', agentId: id }, freshCtx)
    expect(waited.isError).toBe(false)
    expect(waited.content).toBe('resumed and finished')

    // The resumed provider call carried the restored history + continuation.
    const resumeReq = requests[1]!
    expect(resumeReq.messages.some((m) => m.role === 'user' && m.content === 'interrupted task')).toBe(true)
    expect(resumeReq.messages.some((m) => m.role === 'user' && m.content === 'pick up where you stopped')).toBe(true)

    const final = await transcriptAtStatus(dir, id, 'completed')
    expect(final.resultText).toBe('resumed and finished')
  }, 15_000)

  test('resuming a running child and controlling an unknown id are refused', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const gate = deferred()
    const { provider } = sequencedProvider([
      [
        { kind: 'tool-use', call: { id: 't1', name: 'slow', input: {} } },
        { kind: 'finish', stopReason: 'tool_use' },
      ],
      [
        { kind: 'text-delta', delta: 'ok' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const tools = registryWith({
      slow: async () => {
        await gate.promise
        return { content: 'ok', isError: false }
      },
    })
    const ctx = ctxIn(dir, provider, tools)
    const spawn = await agentTool.execute({ prompt: 'busy', background: true }, ctx)
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!

    const resumed = await agentControlTool.execute({ action: 'resume', agentId: id }, ctx)
    expect(resumed.isError).toBe(true)
    expect(resumed.content).toContain('already running')

    const missing = await agentControlTool.execute({ action: 'wait', agentId: 'nope' }, ctx)
    expect(missing.isError).toBe(true)
    expect(missing.content).toContain('no background agent')

    gate.resolve()
    await agentControlTool.execute({ action: 'wait', agentId: id }, ctx)
  })

  test('status reports one child or all children', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const { provider } = sequencedProvider([
      [
        { kind: 'text-delta', delta: 'a done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
      [
        { kind: 'text-delta', delta: 'b done' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const ctx = ctxIn(dir, provider, registryWith({}))
    const spawn = await agentTool.execute({ tasks: ['task a', 'task b'], background: true }, ctx)
    const ids = (spawn.data as { agentIds: string[] }).agentIds
    expect(ids.length).toBe(2)
    for (const id of ids) await agentControlTool.execute({ action: 'wait', agentId: id }, ctx)

    const one = await agentControlTool.execute({ action: 'status', agentId: ids[0] }, ctx)
    expect(one.isError).toBe(false)
    expect((one.data as { status: string }).status).toBe('completed')

    const all = await agentControlTool.execute({ action: 'status' }, ctx)
    expect(all.content).toContain(ids[0]!)
    expect(all.content).toContain(ids[1]!)
  })
})

/** Provider whose stream blocks until the run's abort signal fires. */
function abortAwareProvider(): Provider {
  return {
    async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      await new Promise<void>((resolve) => {
        if (req.signal?.aborted) return resolve()
        req.signal?.addEventListener('abort', () => resolve(), { once: true })
      })
      // The runtime's post-turn abort check ends the run 'aborted' before this
      // finish reaches the completion path — it only exists to close the stream.
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
}

describe('interrupt: cancel a running child mid-flight', () => {
  test('spawn + interrupt stops the child cleanly and frees its running slot', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const ctx = ctxIn(dir, abortAwareProvider(), registryWith({}))

    const spawn = await agentTool.execute({ prompt: 'long running task', background: true }, ctx)
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!

    // Child is running (blocked in the provider stream).
    const before = await agentControlTool.execute({ action: 'status', agentId: id }, ctx)
    expect((before.data as { status: string }).status).toBe('running')

    // Interrupt it: clean stop, not a crash.
    const interrupted = await agentControlTool.execute({ action: 'interrupt', agentId: id }, ctx)
    expect(interrupted.isError).toBe(false)
    expect(interrupted.content).toMatch(/interrupt|stopped/i)

    // The slot is freed: the child no longer reports as running.
    const after = await agentControlTool.execute({ action: 'status', agentId: id }, ctx)
    expect((after.data as { status: string }).status).not.toBe('running')

    // Durable transcript records the clean stop, and the child is resumable.
    const suspended = await transcriptAtStatus(dir, id, 'suspended')
    expect(suspended.doneReason).toBe('aborted')
  }, 15_000)

  test('interrupting a non-running child is refused with a clear message', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orchentra-lifecycle-'))
    const { provider } = sequencedProvider([
      [
        { kind: 'text-delta', delta: 'quick' },
        { kind: 'finish', stopReason: 'end_turn' },
      ],
    ])
    const ctx = ctxIn(dir, provider, registryWith({}))
    const spawn = await agentTool.execute({ prompt: 'quick task', background: true }, ctx)
    const id = (spawn.data as { agentIds: string[] }).agentIds[0]!
    await agentControlTool.execute({ action: 'wait', agentId: id }, ctx)

    const interrupted = await agentControlTool.execute({ action: 'interrupt', agentId: id }, ctx)
    expect(interrupted.isError).toBe(true)
    expect(interrupted.content).toMatch(/not running|completed/i)
  })
})
