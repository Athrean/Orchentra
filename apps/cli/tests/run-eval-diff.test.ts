import { describe, expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { HarnessRunner, HarnessTrialInput, ScoreboardDiff, TrialMetrics } from '@orchentra/cli-core'
import { runEvalDiffCommand } from '../src/commands/run-eval-diff'

const CORPUS = resolve(import.meta.dir, '..', '..', '..', 'evals')

const zeroMetrics: TrialMetrics = {
  billedTokens: 50,
  cachedTokens: 0,
  estimatedCostUsd: 0.01,
  loopDetections: 0,
  toolCalls: 1,
  steps: 1,
  doneReason: 'stop',
}

// "before" build: leaves the fixture broken. "after" build: applies the fix.
// The real grader (not injected) decides pass/fail from the resulting fixture,
// so the diff genuinely reflects two harness builds on the same eval.
const brokenBuild: HarnessRunner = async () => zeroMetrics
const fixedBuild: HarnessRunner = async (input: HarnessTrialInput) => {
  await writeFile(
    join(input.workdir, 'pagination.js'),
    'export function pageCount(total, pageSize) {\n  return Math.ceil(total / pageSize)\n}\n',
  )
  return zeroMetrics
}

function capture(): { text: () => string; sink: (t: string) => void } {
  let buf = ''
  return { text: () => buf, sink: (t) => (buf += t) }
}

describe('orchentra eval --against → scoreboard diff (version-diff mode)', () => {
  test('build B fixes an eval build A fails → the diff records it as a fix', async () => {
    const out = capture()
    const code = await runEvalDiffCommand({
      corpus: CORPUS,
      id: 'coding-bugfix-off-by-one',
      model: 'm',
      k: 1,
      against: 'build-B',
      harnessBefore: brokenBuild,
      harnessAfter: fixedBuild,
      stdout: out.sink,
      stderr: () => {},
    })
    expect(code).toBe(0)

    const diff = JSON.parse(out.text()) as ScoreboardDiff
    expect(diff.after).toBe('build-B')
    expect(diff.fixes).toContain('coding-bugfix-off-by-one')
    expect(diff.regressions).toEqual([])
    expect(diff.passHatKRateDelta).toBeCloseTo(1, 10)
    const delta = diff.evals.find((e) => e.id === 'coding-bugfix-off-by-one')
    expect(delta?.passHatKBefore).toBe(false)
    expect(delta?.passHatKAfter).toBe(true)
  }, 30000)

  test('missing corpus → exit 1', async () => {
    const code = await runEvalDiffCommand({
      corpus: '/nonexistent/xyz',
      model: 'm',
      against: 'b',
      harnessBefore: brokenBuild,
      harnessAfter: fixedBuild,
      stderr: () => {},
    })
    expect(code).toBe(1)
  })
})
