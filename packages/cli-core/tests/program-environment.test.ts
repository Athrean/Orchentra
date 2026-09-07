import { describe, expect, test } from 'bun:test'
import { RunContextStore } from '../src/runtime/context-store'
import {
  ProgramEnvironmentError,
  RlmProgramEnvironment,
  type ProgramEnvironmentOptions,
} from '../src/runtime/program-environment'
import type { ModelFunctionHost, ModelJobResult, ModelJobSnapshot } from '../src/runtime/model-functions'

function environment(overrides: Partial<ProgramEnvironmentOptions> = {}): RlmProgramEnvironment {
  return new RlmProgramEnvironment({
    contextStore: new RunContextStore('program-test'),
    listTools: () => [],
    callTool: async (name) => ({ id: 'tool-1', content: `called ${name}`, isError: false }),
    ...overrides,
  })
}

describe('RlmProgramEnvironment', () => {
  test('has no ambient host, filesystem, network, process, environment, module, clock, or randomness API', async () => {
    const env = environment()
    try {
      const result = await env.execute(`({
        process: typeof process,
        Bun: typeof Bun,
        require: typeof require,
        fetch: typeof fetch,
        WebSocket: typeof WebSocket,
        XMLHttpRequest: typeof XMLHttpRequest,
        setTimeout: typeof setTimeout,
        Date: typeof Date,
        crypto: typeof crypto,
        Deno: typeof Deno,
        provider: typeof provider,
        fs: typeof fs,
        host: typeof __orchentra_call,
        random: (() => { try { Math.random(); return 'available' } catch { return 'blocked' } })(),
      })`)
      expect(result.value).toEqual({
        process: 'undefined',
        Bun: 'undefined',
        require: 'undefined',
        fetch: 'undefined',
        WebSocket: 'undefined',
        XMLHttpRequest: 'undefined',
        setTimeout: 'undefined',
        Date: 'undefined',
        crypto: 'undefined',
        Deno: 'undefined',
        provider: 'undefined',
        fs: 'undefined',
        host: 'function',
        random: 'blocked',
      })
    } finally {
      await env.close()
    }
  })

  test('keeps state within one run and disposes it at close', async () => {
    const env = environment()
    await env.execute('globalThis.total = 40; total')
    expect((await env.execute('total += 2; total')).value).toBe(42)
    await env.close()
    await expect(env.execute('total')).rejects.toThrow('closed')

    const nextRun = environment()
    try {
      expect((await nextRun.execute('typeof total')).value).toBe('undefined')
    } finally {
      await nextRun.close()
    }
  })

  test('routes ctx operations through the run store and records each crossing', async () => {
    const store = new RunContextStore('program-context')
    const descriptor = await store.store({
      kind: 'text',
      trust: 'untrusted',
      provenance: { kind: 'user-input' },
      value: { text: 'alpha NEEDLE omega' },
    })
    const env = environment({ contextStore: store })
    try {
      const result = await env.execute(`(async () => {
        const hit = (await ctx.search(${JSON.stringify(descriptor.handle)}, 'needle')).matches[0]
        const text = (await ctx.read(${JSON.stringify(descriptor.handle)})).text
        const copy = await ctx.store(text, 'copy')
        return { offset: hit.offset, copy: copy.handle, count: (await ctx.list()).length }
      })()`)
      expect(result.value).toMatchObject({ offset: 6, count: 2 })
      expect(result.operations.map((operation) => operation.kind)).toEqual([
        'ctx.search',
        'ctx.read',
        'ctx.store',
        'ctx.list',
      ])
      expect(result.operations.every((operation) => operation.status === 'ok')).toBe(true)
      expect(result.operations[0]).toMatchObject({
        arguments: [descriptor.handle, 'needle'],
        result: { matches: [expect.objectContaining({ offset: 6 })] },
      })
    } finally {
      await env.close()
    }
  })

  test('routes tools.call through the host and preserves typed effects', async () => {
    const calls: Array<{ name: string; input: unknown }> = []
    const env = environment({
      listTools: () => [{ name: 'inspect', description: 'inspect', inputSchema: { type: 'object' } }],
      callTool: async (name, input) => {
        calls.push({ name, input })
        return {
          id: 'inspect-1',
          content: 'visible',
          isError: false,
          images: [{ data: 'aGVsbG8=', mediaType: 'image/png' }],
          evidence: [{ kind: 'assertion', summary: 'visible' }],
          artifacts: [{ uri: '/tmp/a.png', kind: 'file', action: 'created' }],
        }
      },
    })
    try {
      const result = await env.execute(`(async () => ({
        tools: (await tools.list()).map(t => t.name),
        result: await tools.call('inspect', { id: 7 }),
      }))()`)
      expect(calls).toEqual([{ name: 'inspect', input: { id: 7 } }])
      expect(result.value).toMatchObject({
        tools: ['inspect'],
        result: { content: 'visible', isError: false, images: [{ mediaType: 'image/png', bytes: 5 }] },
      })
      expect(result.effects.images).toEqual([{ data: 'aGVsbG8=', mediaType: 'image/png' }])
      expect(result.effects.evidence).toEqual([{ kind: 'assertion', summary: 'visible' }])
      expect(result.effects.artifacts).toEqual([{ uri: '/tmp/a.png', kind: 'file', action: 'created' }])
    } finally {
      await env.close()
    }
  })

  test('overlaps only explicitly safe tool calls and caps admission at four', async () => {
    const state = { running: 0, peak: 0 }
    const env = environment({
      toolScheduling: () => ({
        pure: true,
        idempotent: true,
        concurrencySafe: true,
        speculativeSafe: false,
        resourceClass: 'filesystem',
      }),
      callTool: async (_name, input) => {
        state.running++
        state.peak = Math.max(state.peak, state.running)
        await new Promise((resolve) => setTimeout(resolve, 10))
        state.running--
        return { id: `read-${String((input as { index: number }).index)}`, content: 'ok', isError: false }
      },
    })
    try {
      const execution = await env.execute(`(async () => Promise.all(
        [0, 1, 2, 3, 4, 5].map(index => tools.call('safe-read', { index }))
      ))()`)
      expect(state.peak).toBe(4)
      expect(execution.scheduler.parallelSubmitted).toBe(6)
      expect(execution.scheduler.serialSubmitted).toBe(0)
      expect(execution.scheduler.peakRunning).toBe(4)
      expect(execution.operations.every((operation) => operation.parallelized)).toBe(true)
    } finally {
      await env.close()
    }
  })

  test('unknown or effectful calls are serial barriers around safe batches', async () => {
    const order: string[] = []
    const env = environment({
      toolScheduling: (name) => ({
        pure: name.startsWith('read'),
        idempotent: name.startsWith('read'),
        concurrencySafe: name.startsWith('read'),
        speculativeSafe: false,
        resourceClass: name.startsWith('read') ? 'filesystem' : 'unknown',
      }),
      callTool: async (name) => {
        order.push(`start:${name}`)
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(`end:${name}`)
        return { id: name, content: name, isError: false }
      },
    })
    try {
      const execution = await env.execute(`(async () => Promise.all([
        tools.call('read-before'),
        tools.call('unknown-write'),
        tools.call('read-after'),
      ]))()`)
      expect(order).toEqual([
        'start:read-before',
        'end:read-before',
        'start:unknown-write',
        'end:unknown-write',
        'start:read-after',
        'end:read-after',
      ])
      expect(execution.scheduler.parallelSubmitted).toBe(2)
      expect(execution.scheduler.serialSubmitted).toBe(1)
    } finally {
      await env.close()
    }
  })

  test('routes leaf, recursive, and async job functions through the runtime-owned host', async () => {
    const calls: string[] = []
    const snapshot: ModelJobSnapshot = {
      jobId: 'model-job-1',
      callKind: 'recursive',
      status: 'running',
      model: 'test-model',
      depth: 1,
      attempt: 1,
      startedAt: '2026-09-03T00:00:00.000Z',
    }
    const result: ModelJobResult = {
      ...snapshot,
      status: 'completed',
      endedAt: '2026-09-03T00:00:01.000Z',
      doneReason: 'stop',
      contextHandle: 'ctx_result',
      text: 'model answer',
      isError: false,
      usage: { inputTokens: 4, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0 },
      images: [{ data: 'aGVsbG8=', mediaType: 'image/png' }],
      evidence: [{ kind: 'child-proof', summary: 'verified' }],
      artifacts: [{ uri: '/tmp/result.txt', kind: 'file', action: 'created' }],
    }
    let activeQueries = 0
    let peakQueries = 0
    const modelFunctions: ModelFunctionHost = {
      query: async (kind, input) => {
        calls.push(`query:${kind}:${String(input)}`)
        activeQueries++
        peakQueries = Math.max(peakQueries, activeQueries)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeQueries--
        return { ...result, callKind: kind }
      },
      start: async (kind, input) => {
        calls.push(`start:${kind}:${String(input)}`)
        return { ...snapshot, callKind: kind }
      },
      status: (id) => {
        calls.push(`status:${String(id)}`)
        return snapshot
      },
      wait: async (id) => {
        calls.push(`wait:${String(id)}`)
        return result
      },
      cancel: async (id) => {
        calls.push(`cancel:${String(id)}`)
        return { ...snapshot, status: 'cancelled' }
      },
      send: async (id, message) => {
        calls.push(`send:${String(id)}:${String(message)}`)
        return { job: snapshot, queued: false }
      },
      resume: async (id, message) => {
        calls.push(`resume:${String(id)}:${String(message)}`)
        return snapshot
      },
      close: async () => {},
    }
    const env = environment({ modelFunctions })
    try {
      const execution = await env.execute(`(async () => {
        const leaf = await lm.query('extract')
        const recursive = await rlm.start('investigate')
        await jobs.status(recursive.jobId)
        await jobs.send(recursive.jobId, 'new evidence')
        await jobs.cancel(recursive.jobId)
        await jobs.resume(recursive.jobId, 'continue')
        const waited = await jobs.wait(recursive.jobId)
        return { leaf: leaf.text, waited: waited.contextHandle }
      })()`)

      expect(execution.value).toEqual({ leaf: 'model answer', waited: 'ctx_result' })
      expect(calls).toEqual([
        'query:leaf:extract',
        'start:recursive:investigate',
        'status:model-job-1',
        'send:model-job-1:new evidence',
        'cancel:model-job-1',
        'resume:model-job-1:continue',
        'wait:model-job-1',
      ])
      expect(execution.operations.map((operation) => operation.kind)).toEqual([
        'lm.query',
        'rlm.start',
        'jobs.status',
        'jobs.send',
        'jobs.cancel',
        'jobs.resume',
        'jobs.wait',
      ])
      expect(execution.effects.images).toHaveLength(2)
      expect(execution.effects.evidence).toEqual([
        { kind: 'child-proof', summary: 'verified' },
        { kind: 'child-proof', summary: 'verified' },
      ])
      expect(execution.effects.artifacts).toHaveLength(2)
      const batch = await env.execute(`(async () => Promise.all(
        [1, 2, 3, 4, 5, 6].map(i => lm.query('leaf-' + i))
      ))()`)
      expect(batch.value).toHaveLength(6)
      expect(peakQueries).toBe(4)
      expect(activeQueries).toBe(0)
      expect(batch.scheduler.peakRunning).toBe(4)
    } finally {
      await env.close()
    }
  })

  test('fails model functions closed when the runtime host is absent', async () => {
    const env = environment()
    try {
      await expect(env.execute(`(async () => lm.query('work'))()`)).rejects.toThrow('model functions are unavailable')
    } finally {
      await env.close()
    }
  })

  test('rejects imports and recursive environment calls', async () => {
    const env = environment()
    try {
      await expect(env.execute(`import x from 'host-module'; x`)).rejects.toBeInstanceOf(ProgramEnvironmentError)
      await expect(env.execute(`(async () => tools.call('rlm_execute', { code: '1' }))()`)).rejects.toThrow(
        'Recursive rlm_execute calls are not allowed',
      )
    } finally {
      await env.close()
    }
  })

  test('interrupts infinite computation and enforces code, result, and operation caps', async () => {
    const wallTime = environment({ limits: { maxWallTimeMs: 10 } })
    await expect(wallTime.execute('while (true) {}')).rejects.toThrow('wall-time limit exceeded')
    await wallTime.close()

    const caps = environment({
      limits: { maxCodeChars: 80, maxResultChars: 10, maxOperationsPerExecution: 1, maxOperationsPerRun: 2 },
    })
    try {
      await expect(caps.execute('x'.repeat(81))).rejects.toThrow('code exceeds')
      await expect(caps.execute(`'${'x'.repeat(11)}'`)).rejects.toThrow('result exceeds')
      await expect(caps.execute('(async()=>{await ctx.list();await ctx.list()})()')).rejects.toThrow(
        'operation cap exceeded',
      )
    } finally {
      await caps.close()
    }

    const memory = environment()
    try {
      await expect(memory.execute('new Uint8Array(40 * 1024 * 1024).byteLength')).rejects.toThrow('out of memory')
    } finally {
      await memory.close()
    }

    const stack = environment()
    try {
      await expect(stack.execute('(function recurse(){ return recurse() })()')).rejects.toThrow()
    } finally {
      await stack.close()
    }

    const runCap = environment({ limits: { maxOperationsPerExecution: 2, maxOperationsPerRun: 2 } })
    try {
      await runCap.execute('(async()=>ctx.list())()')
      await runCap.execute('(async()=>ctx.list())()')
      await expect(runCap.execute('(async()=>ctx.list())()')).rejects.toThrow('per run')
    } finally {
      await runCap.close()
    }
  })

  test('times out a promise with no progress and rejects fire-and-forget operations', async () => {
    const pending = environment({ limits: { maxWallTimeMs: 20 } })
    try {
      await expect(pending.execute('new Promise(() => {})')).rejects.toThrow('wall-time limit exceeded')
    } finally {
      await pending.close()
    }

    const unawaited = environment()
    try {
      await expect(unawaited.execute('ctx.list(); 42')).rejects.toThrow('before all governed operations were awaited')
    } finally {
      await unawaited.close()
    }
  })

  test('cancels while an otherwise-pending guest promise is awaiting progress', async () => {
    const abort = new AbortController()
    const env = environment({ signal: abort.signal, limits: { maxWallTimeMs: 1_000 } })
    const execution = env.execute('new Promise(() => {})')
    setTimeout(() => abort.abort(), 10)
    try {
      await expect(execution).rejects.toThrow('aborted')
    } finally {
      await env.close()
    }
  })

  test('fails before execution when the run is already cancelled', async () => {
    const abort = new AbortController()
    abort.abort()
    const env = environment({ signal: abort.signal })
    await expect(env.execute('1 + 1')).rejects.toThrow('aborted')
    await env.close()
  })
})
