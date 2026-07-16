import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarnessRunner, HarnessTrialInput, ScoreboardDiff, TrialMetrics } from '@orchentra/cli-core'
import { runEvalDiffCommand, runEvalProfilesAbCommand } from '../src/commands/run-eval-diff'

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

async function makeCorpus(): Promise<string> {
  const corpus = await mkdtemp(join(tmpdir(), 'orchentra-eval-diff-'))
  const dir = join(corpus, 'coding-bugfix-off-by-one')
  await mkdir(join(dir, 'fixture'), { recursive: true })
  await mkdir(join(corpus, 'lib'))
  await writeFile(join(dir, 'task.md'), 'repair pagination\n')
  await writeFile(
    join(dir, 'meta.json'),
    JSON.stringify({
      id: 'coding-bugfix-off-by-one',
      category: 'coding',
      type: 'fixture',
      grader: 'test',
      k: 1,
      timeoutSec: 10,
      versionAdded: 'test',
    }),
  )
  await writeFile(join(dir, 'fixture', 'pagination.js'), 'export const pageCount = () => Math.floor(1)\n')
  await writeFile(join(dir, 'grade.sh'), '#!/usr/bin/env bash\ngrep -q "Math.ceil" fixture/pagination.js\n')
  return corpus
}

function capture(): { text: () => string; sink: (t: string) => void } {
  let buf = ''
  return { text: () => buf, sink: (t) => (buf += t) }
}

describe('orchentra eval --against → scoreboard diff (version-diff mode)', () => {
  test('build B fixes an eval build A fails → the diff records it as a fix', async () => {
    const corpus = await makeCorpus()
    try {
      const out = capture()
      const code = await runEvalDiffCommand({
        corpus,
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
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
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

describe('orchentra eval --ab-profiles → generic vs profiled diff (M5 A/B harness)', () => {
  test('same corpus/model/k both ways; the diff labels the two profile modes', async () => {
    const corpus = await makeCorpus()
    try {
      const out = capture()
      const code = await runEvalProfilesAbCommand({
        corpus,
        id: 'coding-bugfix-off-by-one',
        model: 'm',
        k: 1,
        harnessGeneric: brokenBuild,
        harnessProfiled: fixedBuild,
        stdout: out.sink,
        stderr: () => {},
      })
      expect(code).toBe(0)

      const diff = JSON.parse(out.text()) as ScoreboardDiff
      expect(diff.before).toEndWith('#generic')
      expect(diff.after).toEndWith('#profiled')
      expect(diff.model).toBe('m')
      // The scoreboard diff is the justification artifact: a profiled win
      // shows up as a fix on the same corpus, same k.
      expect(diff.fixes).toContain('coding-bugfix-off-by-one')
      expect(diff.regressions).toEqual([])
    } finally {
      await rm(corpus, { recursive: true, force: true })
    }
  }, 30000)

  test('missing corpus → exit 1', async () => {
    const code = await runEvalProfilesAbCommand({
      corpus: '/nonexistent/xyz',
      model: 'm',
      harnessGeneric: brokenBuild,
      harnessProfiled: fixedBuild,
      stderr: () => {},
    })
    expect(code).toBe(1)
  })
})
