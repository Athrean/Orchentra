import { expect, test } from 'bun:test'
import { parseArgs } from '../src/args'
import { runTraceCommand } from '../src/commands/run-trace'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ConversationRuntime,
  buildSystemPrompt,
  loadTrajectory,
  readTraceEvents,
  parseLearningExport,
  scoreLearningTrajectory,
  type LearningRewardInput,
  type Provider,
} from '@orchentra/cli-core'
import { DefaultToolRegistry, rlmExecuteTool, contextTools } from '@orchentra/cli-tools'

test('trace CLI parses live/tree/drill-down modes and fails closed on paths or incompatible flags', async () => {
  expect(parseArgs(['bun', 'cli', 'trace', 'run-one', '--watch'])).toEqual({
    kind: 'trace',
    traceId: 'run-one',
    json: false,
    events: false,
    watch: true,
    training: false,
  })
  expect(() => parseArgs(['bun', 'cli', 'trace', '../outside'])).toThrow()
  expect(() => parseArgs(['bun', 'cli', 'trace', 'run', '--events', '--watch'])).toThrow()
  expect(parseArgs(['bun', 'cli', 'trace', 'run', '--training'])).toMatchObject({ kind: 'trace', training: true })
  expect(() => parseArgs(['bun', 'cli', 'trace', 'run', '--training', '--watch'])).toThrow()
  let error = ''
  expect(
    await runTraceCommand({
      traceId: '../outside',
      stderr: (value) => {
        error = value
      },
    }),
  ).toBe(1)
  expect(error).toContain('invalid trace id')
})

test('real runtime traces stay linked while running and replay through a fresh CLI process', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'orchentra-trace-cli-'))
  const secret = `sk-${'x'.repeat(32)}`
  let liveLinked = false
  let watching: Promise<number> | undefined
  let watched = ''
  const provider: Provider = {
    async *stream(request) {
      if (request.tools.length === 0) {
        yield { kind: 'text-delta', delta: `leaf result ${secret}` }
        yield { kind: 'finish', stopReason: 'end_turn' }
        return
      }
      const child = request.systemStatic.includes('bounded recursive child')
      if (!request.messages.some((message) => message.role === 'tool')) {
        const code = child
          ? `(async () => { const d = await ctx.store('fixture data'); await ctx.read(d.handle); await ctx.search(d.handle, 'fixture'); await tools.call('context_read', {handle:d.handle}); return lm.query('leaf slice') })()`
          : `(async () => rlm.query('child slice'))()`
        yield {
          kind: 'tool-use',
          call: { id: child ? 'child-code' : 'root-code', name: 'rlm_execute', input: { code } },
        }
        yield { kind: 'finish', stopReason: 'tool_use' }
        return
      }
      yield { kind: 'text-delta', delta: child ? 'child done' : 'root done' }
      yield { kind: 'finish', stopReason: 'end_turn' }
    },
  }
  const runtime = new ConversationRuntime(
    {
      model: 'fixture-model',
      maxOutputTokens: 512,
      contextWindowTokens: 100_000,
      compactionThreshold: 0.8,
      keepRecentOnCompact: 4,
      budget: { maxSteps: 10, maxTokens: 100_000 },
      sessionId: 'trace-cli',
      cwd,
      executionProfile: 'rlm',
    },
    {
      provider,
      tools: new DefaultToolRegistry([rlmExecuteTool, ...contextTools]),
      systemPrompt: buildSystemPrompt({ staticParts: ['fixture policy'] }),
      onEvent: async (event) => {
        if (event.kind !== 'recursive_link') return
        const live = await loadTrajectory(cwd, runtime.lastTraceId!)
        expect(live.complete).toBe(false)
        expect(live.root.children[0]).toMatchObject({ status: 'running', traceId: event.childTraceId })
        liveLinked = true
        watching = runTraceCommand({
          cwd,
          traceId: runtime.lastTraceId!,
          watch: true,
          stdout: (text) => {
            watched += text
          },
        })
      },
    },
  )
  try {
    for await (const event of runtime.run({ userMessage: 'root slice' })) {
      if (event.kind === 'done') expect(event.reason).toBe('stop')
    }
    expect(liveLinked).toBe(true)
    expect(await watching).toBe(0)
    expect(watched).toContain('[running]')
    expect(watched).toContain('[completed]')
    const traceId = runtime.lastTraceId!
    const tree = await loadTrajectory(cwd, traceId)
    expect(tree.root.status).toBe('stop')
    const child = tree.root.children[0]!
    expect(child.status).toBe('completed')
    expect(child.children[0]).toMatchObject({ kind: 'leaf', status: 'completed' })
    const childEvents = await readTraceEvents(cwd, child.traceId!)
    expect(
      childEvents
        .filter((event) => event.kind === 'context_access')
        .map((event) => event.kind === 'context_access' && event.operation),
    ).toEqual(expect.arrayContaining(['store', 'read', 'search']))
    expect(childEvents.filter((event) => event.kind === 'context_access' && event.operation === 'read')).toHaveLength(2)
    const proc = Bun.spawn([process.execPath, resolve(import.meta.dir, '../src/main.ts'), 'trace', traceId, '--json'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const coldText = await new Response(proc.stdout).text()
    const errors = await new Response(proc.stderr).text()
    expect(await proc.exited).toBe(0)
    expect(errors).toBe('')
    expect(JSON.parse(coldText)).toEqual(tree)
    let eventsText = ''
    expect(
      await runTraceCommand({
        cwd,
        traceId: child.traceId!,
        events: true,
        stdout: (text) => {
          eventsText += text
        },
      }),
    ).toBe(0)
    expect(eventsText).toContain('program_operation')
    expect(eventsText).not.toContain(secret)
    expect(eventsText).toContain('<REDACTED>')
    let rendered = ''
    expect(
      await runTraceCommand({
        cwd,
        traceId,
        watch: true,
        stdout: (text) => {
          rendered += text
        },
      }),
    ).toBe(0)
    expect(rendered).toContain(`trace=${child.traceId}`)
    const trainingProc = Bun.spawn(
      [process.execPath, resolve(import.meta.dir, '../src/main.ts'), 'trace', traceId, '--training'],
      { cwd, stdout: 'pipe', stderr: 'pipe' },
    )
    const trainingText = await new Response(trainingProc.stdout).text()
    const trainingError = await new Response(trainingProc.stderr).text()
    expect(await trainingProc.exited).toBe(0)
    expect(trainingError).toBe('')
    const training = parseLearningExport(JSON.parse(trainingText))
    expect(training.runs).toHaveLength(2)
    expect(training.runs[1]!.parentTraceId).toBe(traceId)
    expect(trainingText).toContain('lm.query')
    expect(trainingText).not.toContain(secret)

    // Rewards need externally supplied labels; the CLI scores the same export
    // the library does and refuses a label set naming another dataset.
    const labels = (datasetHash: string): LearningRewardInput => ({
      schemaVersion: 1,
      datasetHash,
      labels: { correctness: { verifier: 'fixture-grader', version: '1', artifactSha256: 'a'.repeat(64), score: 1 } },
      limits: {
        maxDepth: 4,
        maxConcurrentJobsPerRuntime: 4,
        maxTokens: 1_000_000,
        maxCostUsd: 1,
        maxLatencyMs: 600_000,
      },
    })
    const labelsPath = join(cwd, 'labels.json')
    await Bun.write(labelsPath, JSON.stringify(labels(training.datasetHash)))
    let scored = ''
    expect(
      await runTraceCommand({
        cwd,
        traceId,
        reward: labelsPath,
        stdout: (text) => {
          scored += text
        },
      }),
    ).toBe(0)
    expect(JSON.parse(scored)).toEqual(scoreLearningTrajectory(training, labels(training.datasetHash)))
    expect(JSON.parse(scored).missing).toContain('decomposition')
    await Bun.write(labelsPath, JSON.stringify(labels('stale-dataset')))
    let rewardError = ''
    expect(
      await runTraceCommand({
        cwd,
        traceId,
        reward: labelsPath,
        stderr: (text) => {
          rewardError += text
        },
      }),
    ).toBe(1)
    expect(rewardError).toContain('mismatch')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
