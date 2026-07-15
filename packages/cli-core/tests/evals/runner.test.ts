import { describe, expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ProviderStreamEvent } from '../../src/runtime/provider'
import type { ToolRegistry } from '../../src/runtime/tools'
import { effectiveK } from '../../src/evals/corpus'
import { runEvalTrials, type RunOptions } from '../../src/evals/runner'
import type { HarnessRunner, HarnessTrialInput, TrialMetrics } from '../../src/evals/types'
import { runScenario } from '../support/scenario'

const CORPUS = resolve(import.meta.dir, '..', '..', '..', '..', 'evals')

// A minimal tool round-trip so a scenario run emits a real tool_use event —
// the runner's metrics (tool calls, tokens, done reason) are read off the same
// runtime substrate the rest of the suite exercises, not hand-faked.
const oneToolTools: ToolRegistry = {
  list: () => [{ name: 'noop', description: 'noop', inputSchema: {} }],
  has: (n) => n === 'noop',
  execute: async () => ({ content: 'ok', isError: false }),
}
const usage = (i: number, o: number): ProviderStreamEvent => ({
  kind: 'usage',
  usage: { inputTokens: i, outputTokens: o, cacheReadTokens: 0, cacheCreationTokens: 0 },
})
const TURNS: ProviderStreamEvent[][] = [
  [
    { kind: 'tool-use', call: { id: 't1', name: 'noop', input: {} } },
    usage(10, 5),
    { kind: 'finish', stopReason: 'tool_use' },
  ],
  [{ kind: 'text-delta', delta: 'done' }, usage(8, 1), { kind: 'finish', stopReason: 'end_turn' }],
]

/** Harness that runs a real scenario for metrics, then applies `solve` to the fixture copy. */
function harness(solve: (input: HarnessTrialInput) => Promise<void>): HarnessRunner {
  return async (input) => {
    const r = await runScenario({
      name: input.evalId,
      input: input.taskPrompt,
      turns: TURNS,
      tools: oneToolTools,
      expect: {},
    })
    await solve(input)
    const metrics: TrialMetrics = {
      billedTokens: r.usage.inputTokens + r.usage.outputTokens,
      cachedTokens: r.usage.cacheReadTokens,
      estimatedCostUsd: r.totalTokens * 1e-6,
      loopDetections: r.events.filter((e) => e.kind === 'loop_detected').length,
      toolCalls: r.events.filter((e) => e.kind === 'tool_use').length,
      steps: 0,
      doneReason: r.doneReason,
    }
    return metrics
  }
}

const NOOP = harness(async () => {})
const opts = (h: HarnessRunner, k = 1): RunOptions => ({ harness: h, model: 'test', k })

describe('effectiveK', () => {
  test('override wins, then reliability=5, then meta.k, then default 3', () => {
    const base = {
      id: 'x',
      category: 'coding',
      type: 't',
      grader: 'test',
      k: 3,
      timeoutSec: 60,
      versionAdded: '0.6.0',
    } as const
    expect(effectiveK(base, 5)).toBe(5)
    expect(effectiveK(base)).toBe(3)
    expect(effectiveK({ ...base, reliability: true })).toBe(5)
    expect(effectiveK({ ...base, k: 0 })).toBe(3)
  })
})

describe('runEvalTrials — real grader dispatch is bidirectional', () => {
  test('test grader: seeded fixture fails, solved fixture passes', async () => {
    const dir = join(CORPUS, 'coding-bugfix-off-by-one')

    const failed = await runEvalTrials(dir, opts(NOOP))
    expect(failed.trials).toHaveLength(1)
    expect(failed.trials[0]?.passed).toBe(false)
    expect(failed.trials[0]?.exitCode).not.toBe(0)
    // metrics still captured on a failed trial
    expect(failed.trials[0]?.metrics.toolCalls).toBe(1)
    expect(failed.trials[0]?.metrics.estimatedCostUsd).toBeGreaterThan(0)

    const solver = harness(async ({ workdir }) => {
      await writeFile(
        join(workdir, 'pagination.js'),
        'export function pageCount(total, pageSize) {\n  return Math.ceil(total / pageSize)\n}\n',
      )
    })
    const solved = await runEvalTrials(dir, opts(solver))
    expect(solved.trials[0]?.passed).toBe(true)
    expect(solved.trials[0]?.exitCode).toBe(0)
  }, 20000)

  test('diff grader: coupled fixture fails, decoupled fixture passes', async () => {
    const dir = join(CORPUS, 'coding-refactor-decouple-logger')

    const failed = await runEvalTrials(dir, opts(NOOP))
    expect(failed.trials[0]?.passed).toBe(false)
    expect(failed.meta.grader).toBe('diff')

    const solver = harness(async ({ workdir }) => {
      await writeFile(
        join(workdir, 'service.js'),
        'export function createOrder(items) {\n  return { items, total: items.length }\n}\n',
      )
    })
    const solved = await runEvalTrials(dir, opts(solver))
    expect(solved.trials[0]?.passed).toBe(true)
  }, 20000)

  test('runs k trials and never mutates the real corpus fixture', async () => {
    const dir = join(CORPUS, 'coding-bugfix-off-by-one')
    const solver = harness(async ({ workdir }) => {
      await writeFile(join(workdir, 'pagination.js'), 'export function pageCount() { return 42 }\n')
    })
    const run = await runEvalTrials(dir, opts(solver, 2))
    expect(run.trials).toHaveLength(2)
    const original = await Bun.file(join(dir, 'fixture', 'pagination.js')).text()
    expect(original).toContain('Math.floor')
  }, 20000)
})
