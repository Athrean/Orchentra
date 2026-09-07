import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_MODEL_FUNCTION_LIMITS,
  ModelFunctionError,
  ModelJobManager,
  type ModelFunctionOutcome,
  type ModelJobRunRequest,
} from '../src/runtime/model-functions'

const usage = { inputTokens: 7, outputTokens: 3, cacheReadTokens: 2, cacheCreationTokens: 1 }

function outcome(overrides: Partial<ModelFunctionOutcome> = {}): ModelFunctionOutcome {
  return { model: 'test-model', text: 'answer', isError: false, doneReason: 'stop', usage, ...overrides }
}

describe('ModelJobManager', () => {
  // Regression: the config loader reports an unconfigured cap as an explicit
  // `undefined`, which a plain spread wrote over the default — every real
  // `--execution-profile rlm` run died on "maxDepth must be positive".
  test('treats an unset limit as unconfigured, not as zero', async () => {
    const manager = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      limits: { maxDepth: undefined, maxConcurrent: undefined } as never,
      run: async () => outcome(),
      storeResult: async () => undefined,
    })
    const result = await manager.query('leaf', 'ask')
    expect(result.isError).toBe(false)
    await manager.close()
    expect(
      () =>
        new ModelJobManager({
          model: 'm',
          depth: 0,
          limits: { maxDepth: 0 },
          run: async () => outcome(),
          storeResult: async () => undefined,
        }),
    ).toThrow('must be positive')
    expect(DEFAULT_MODEL_FUNCTION_LIMITS.maxDepth).toBeGreaterThan(0)
  })

  test('runs a bounded query, stores its full result, and emits lifecycle snapshots', async () => {
    const events: unknown[] = []
    const manager = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      idGen: () => 'one',
      run: async (request) => {
        expect(request.callKind).toBe('leaf')
        expect(request.options).toEqual({
          model: 'test-model',
          maxOutputTokens: 128,
          maxTokens: 32_000,
          maxSteps: 1,
          timeoutMs: 30_000,
        })
        return outcome()
      },
      storeResult: async () => 'ctx_result',
      onJob: (job) => events.push(job),
    })

    const result = await manager.query('leaf', 'extract this', { maxOutputTokens: 128 })

    expect(result).toMatchObject({
      jobId: 'model-job-one',
      callKind: 'leaf',
      status: 'completed',
      depth: 0,
      text: 'answer',
      contextHandle: 'ctx_result',
      usage,
      isError: false,
    })
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ status: 'running' })
    expect(events[1]).toMatchObject({ status: 'completed', contextHandle: 'ctx_result', usage })
    await manager.close()
  })

  test('allows explicit async fan-out, rejects excess admission, and contains partial failure', async () => {
    const releases = new Map<string, () => void>()
    let id = 0
    const manager = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      limits: { maxConcurrent: 2 },
      idGen: () => String(++id),
      run: async (request) => {
        await new Promise<void>((resolve) => releases.set(request.jobId, resolve))
        if (request.input === 'fail') throw new Error('branch failed')
        return outcome({ text: request.input })
      },
      storeResult: async () => undefined,
    })

    const one = await manager.start('leaf', 'ok')
    const two = await manager.start('leaf', 'fail')
    await expect(manager.start('leaf', 'excess')).rejects.toThrow('Concurrent model-job cap reached (2)')
    releases.get(one.jobId)!()
    releases.get(two.jobId)!()

    expect(await manager.wait(one.jobId)).toMatchObject({ status: 'completed', text: 'ok', isError: false })
    expect(await manager.wait(two.jobId)).toMatchObject({ status: 'failed', text: 'branch failed', isError: true })
    await manager.close()
  })

  test('cancels, retains recursive state, accepts parent messages, and resumes in the same run', async () => {
    const messages: string[] = []
    const manager = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      idGen: () => 'recursive',
      run: async (request) => {
        request.registerMessenger((message) => messages.push(message))
        if (request.attempt === 1) {
          await aborted(request)
          return outcome({ text: 'checkpoint', doneReason: 'aborted', resumeState: { cursor: 4 } })
        }
        expect(request.resumeState).toEqual({ cursor: 4 })
        return outcome({ text: `resumed: ${request.input}`, resumeState: { cursor: 5 } })
      },
      storeResult: async (_result, job) => `ctx_attempt_${job.attempt}`,
    })

    const started = await manager.start('recursive', 'investigate')
    expect(await manager.send(started.jobId, 'focus on evidence')).toMatchObject({ queued: false })
    expect(messages).toEqual(['focus on evidence'])
    expect(await manager.cancel(started.jobId)).toMatchObject({ status: 'cancelled', attempt: 1 })

    expect(await manager.resume(started.jobId, 'continue carefully')).toMatchObject({ status: 'running', attempt: 2 })
    expect(await manager.wait(started.jobId)).toMatchObject({
      status: 'completed',
      attempt: 2,
      text: 'resumed: continue carefully',
      contextHandle: 'ctx_attempt_2',
    })
    await manager.close()
  })

  test('enforces timeout, depth, request bounds, and the runtime-owned preflight', async () => {
    const timed = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      limits: { maxTimeoutMs: 20 },
      idGen: () => 'timed',
      run: async (request) => {
        await aborted(request)
        return outcome({ doneReason: 'aborted', resumeState: {} })
      },
      storeResult: async () => undefined,
    })
    const job = await timed.start('recursive', 'slow', { timeoutMs: 5 })
    expect(await timed.wait(job.jobId)).toMatchObject({ status: 'timed_out', doneReason: 'timeout', isError: true })
    await timed.close()

    const capped = new ModelJobManager({
      model: 'test-model',
      depth: 2,
      limits: { maxDepth: 2, maxInputChars: 8, maxOutputTokens: 16 },
      beforeStart: () => {
        throw new ModelFunctionError('shared budget exhausted')
      },
      run: async () => outcome(),
      storeResult: async () => undefined,
    })
    await expect(capped.start('recursive', 'task')).rejects.toThrow('depth cap reached (2)')
    await expect(capped.start('leaf', 'too-long!')).rejects.toThrow('shared budget exhausted')
    await capped.close()

    const validates = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      limits: { maxInputChars: 8, maxOutputTokens: 16 },
      run: async () => outcome(),
      storeResult: async () => undefined,
    })
    await expect(validates.start('leaf', 'too-long!')).rejects.toThrow('8-character cap')
    await expect(validates.start('leaf', 'ok', { maxOutputTokens: 17 })).rejects.toThrow(
      'maxOutputTokens must be an integer between 1 and 16',
    )
    await expect(validates.start('leaf', 'ok', { surprise: true })).rejects.toThrow(
      'Unknown model function option(s): surprise',
    )
    await validates.close()
  })

  test('closing a run cancels and settles every unfinished job', async () => {
    const manager = new ModelJobManager({
      model: 'test-model',
      depth: 0,
      idGen: () => 'open',
      run: async (request) => {
        await aborted(request)
        return outcome({ doneReason: 'aborted' })
      },
      storeResult: async () => undefined,
    })
    const job = await manager.start('leaf', 'work')
    await manager.close()
    await expect(manager.wait(job.jobId)).rejects.toThrow('closed')
  })
})

function aborted(request: ModelJobRunRequest): Promise<void> {
  if (request.signal.aborted) return Promise.resolve()
  return new Promise((resolve) => request.signal.addEventListener('abort', () => resolve(), { once: true }))
}
