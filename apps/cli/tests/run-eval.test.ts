import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EvalMeta, GradeResult, HarnessRunner, Scoreboard } from '@orchentra/cli-core'
import { parseArgs } from '../src/args'
import { runEvalCommand } from '../src/commands/run-eval'

const argv = (...rest: string[]): string[] => ['bun', 'orchentra', ...rest]

/** A disposable corpus keeps public CI independent of the private local corpus. */
async function makeCorpus(): Promise<string> {
  const corpus = await mkdtemp(join(tmpdir(), 'orchentra-eval-corpus-'))
  await mkdir(join(corpus, 'lib'))
  for (const category of ['coding', 'browser'] as const) {
    for (let n = 1; n <= 10; n++) {
      const id = `${category}-fixture-${n}`
      const dir = join(corpus, id)
      await mkdir(join(dir, 'fixture'), { recursive: true })
      await writeFile(join(dir, 'task.md'), `solve ${id}\n`)
      await writeFile(
        join(dir, 'meta.json'),
        JSON.stringify({ id, category, type: 'fixture', grader: 'test', k: 1, timeoutSec: 10, versionAdded: 'test' }),
      )
    }
  }
  return corpus
}

// Deterministic seams so the command runs the whole real corpus fast, with no
// live model and no browser engine: the harness is a no-op with fixed metrics,
// and the grader passes coding evals / fails browser evals for clear discrimination.
const fakeHarness: HarnessRunner = async () => ({
  billedTokens: 120,
  cachedTokens: 10,
  estimatedCostUsd: 0.02,
  loopDetections: 0,
  toolCalls: 3,
  steps: 2,
  doneReason: 'stop',
})
const codingPasses = async (_dir: string, meta: EvalMeta): Promise<GradeResult> => {
  const passed = meta.category === 'coding'
  return { exitCode: passed ? 0 : 1, passed, timedOut: false }
}

function capture(): { text: () => string; sink: (t: string) => void } {
  let buf = ''
  return { text: () => buf, sink: (t) => (buf += t) }
}

describe('parseArgs: eval', () => {
  test('flags (space + inline forms)', () => {
    expect(parseArgs(argv('eval', '--corpus', 'evals/', '-m', 'claude-x', '--k', '5', '--out', 'sb.json'))).toEqual({
      kind: 'eval',
      corpus: 'evals/',
      id: undefined,
      model: 'claude-x',
      k: 5,
      out: 'sb.json',
      against: undefined,
    })
    const inline = parseArgs(argv('eval', '--corpus=evals/', '--id=coding-bugfix-off-by-one', '--model=m'))
    expect(inline).toMatchObject({ kind: 'eval', corpus: 'evals/', id: 'coding-bugfix-off-by-one', model: 'm' })
  })

  test('rejects unknown args and non-positive k', () => {
    expect(() => parseArgs(argv('eval', '--bogus'))).toThrow(/unknown argument/)
    expect(() => parseArgs(argv('eval', '--k', '0'))).toThrow(/positive integer/)
    expect(() => parseArgs(argv('eval', '--k', 'abc'))).toThrow(/positive integer/)
  })
})

describe('orchentra eval → scoreboard (v0.6.0 exit criterion)', () => {
  test('one command emits a scoreboard with pass@1/pass^k/cost-per-success for all 20 tasks', async () => {
    const corpus = await makeCorpus()
    try {
      const out = capture()
      const code = await runEvalCommand({
        corpus,
        model: 'test-model',
        k: 1,
        harness: fakeHarness,
        grade: codingPasses,
        stdout: out.sink,
        stderr: () => {},
      })
      expect(code).toBe(0)

      const board = JSON.parse(out.text()) as Scoreboard
      expect(board.version).toBe(1)
      expect(board.model).toBe('test-model')
      expect(board.evals).toHaveLength(20)
      expect(board.summary.total).toBe(20)

      // Every entry carries the scoreboard metrics; the fixture keeps the
      // original 10 coding + 10 browser discrimination without publishing data.
      for (const e of board.evals) {
        expect(typeof e.passAt1).toBe('boolean')
        expect(typeof e.passHatK).toBe('boolean')
        expect(e.costPerSuccessUsd === null || typeof e.costPerSuccessUsd === 'number').toBe(true)
      }
      const coding = board.evals.filter((e) => e.category === 'coding')
      const browser = board.evals.filter((e) => e.category === 'browser')
      expect(coding).toHaveLength(10)
      expect(browser).toHaveLength(10)
      expect(coding.every((e) => e.passHatK)).toBe(true)
      expect(browser.every((e) => !e.passHatK)).toBe(true)
      expect(board.summary.passAt1Rate).toBeCloseTo(0.5, 10)
      expect(coding.every((e) => typeof e.costPerSuccessUsd === 'number')).toBe(true)
      expect(browser.every((e) => e.costPerSuccessUsd === null)).toBe(true)
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 20000)

  test('--id runs a single eval; --out writes the scoreboard to disk', async () => {
    const corpus = await makeCorpus()
    try {
      const outPath = join(corpus, 'sb.json')
      const code = await runEvalCommand({
        corpus,
        id: 'coding-fixture-1',
        model: 'm',
        k: 1,
        out: outPath,
        harness: fakeHarness,
        grade: codingPasses,
        stderr: () => {},
      })
      expect(code).toBe(0)
      const board = JSON.parse(await readFile(outPath, 'utf8')) as Scoreboard
      expect(board.evals).toHaveLength(1)
      expect(board.evals[0]?.id).toBe('coding-fixture-1')
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 20000)

  test('unknown corpus → exit 1', async () => {
    const code = await runEvalCommand({
      corpus: '/nonexistent/corpus/xyz',
      model: 'm',
      harness: fakeHarness,
      grade: codingPasses,
      stderr: () => {},
    })
    expect(code).toBe(1)
  })
})
