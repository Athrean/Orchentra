import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderStreamEvent } from '../../src/runtime/provider'
import type { ToolRegistry } from '../../src/runtime/tools'
import { effectiveK } from '../../src/evals/corpus'
import { runEvalTrials, type RunOptions } from '../../src/evals/runner'
import type { HarnessRunner, HarnessTrialInput, TrialMetrics } from '../../src/evals/types'
import { runScenario } from '../support/scenario'

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

async function makeEval(kind: 'test' | 'diff'): Promise<{ corpus: string; dir: string }> {
  const corpus = await mkdtemp(join(tmpdir(), 'orchentra-eval-runner-'))
  const id = kind === 'test' ? 'test-fixture' : 'diff-fixture'
  const dir = join(corpus, id)
  await mkdir(join(dir, 'fixture'), { recursive: true })
  await mkdir(join(corpus, 'lib'))
  await writeFile(join(dir, 'task.md'), `repair ${kind} fixture\n`)
  await writeFile(
    join(dir, 'meta.json'),
    JSON.stringify({
      id,
      category: 'coding',
      type: 'fixture',
      grader: kind,
      k: 1,
      timeoutSec: 10,
      versionAdded: 'test',
    }),
  )
  if (kind === 'test') {
    await writeFile(join(dir, 'fixture', 'pagination.js'), 'export const pageCount = () => Math.floor(1)\n')
    await writeFile(join(dir, 'grade.sh'), '#!/usr/bin/env bash\ngrep -q "Math.ceil" fixture/pagination.js\n')
  } else {
    await writeFile(join(dir, 'fixture', 'service.js'), 'export const createOrder = () => console.log("coupled")\n')
    await writeFile(
      join(dir, 'grade.mjs'),
      'import { readFileSync } from "node:fs"\nprocess.exit(readFileSync(new URL("./fixture/service.js", import.meta.url), "utf8").includes("console.") ? 1 : 0)\n',
    )
  }
  return { corpus, dir }
}

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
    const { corpus, dir } = await makeEval('test')
    try {
      const failed = await runEvalTrials(dir, opts(NOOP))
      expect(failed.trials).toHaveLength(1)
      expect(failed.trials[0]?.passed).toBe(false)
      expect(failed.trials[0]?.exitCode).not.toBe(0)
      // Metrics still come from the actual runtime scenario on a failed trial.
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
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 20000)

  test('diff grader: coupled fixture fails, decoupled fixture passes', async () => {
    const { corpus, dir } = await makeEval('diff')
    try {
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
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 20000)

  test('runs k trials and never mutates the real corpus fixture', async () => {
    const { corpus, dir } = await makeEval('test')
    try {
      const solver = harness(async ({ workdir }) => {
        await writeFile(join(workdir, 'pagination.js'), 'export function pageCount() { return 42 }\n')
      })
      const run = await runEvalTrials(dir, opts(solver, 2))
      expect(run.trials).toHaveLength(2)
      const original = await Bun.file(join(dir, 'fixture', 'pagination.js')).text()
      expect(original).toContain('Math.floor')
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 20000)
})
