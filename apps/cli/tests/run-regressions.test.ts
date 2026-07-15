import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GradeResult, RegressionReport } from '@orchentra/cli-core'
import { parseArgs } from '../src/args'
import { runRegressionsCommand, type RunRegressionsArgs } from '../src/commands/run-regressions'

function makeSuite(): string {
  const suite = mkdtempSync(join(tmpdir(), 'orchentra-regressions-'))
  for (const id of ['reg-one-shot-exit-code', 'reg-compaction-pair-safe']) {
    const dir = join(suite, id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify({
        id,
        category: 'harness',
        grader: 'test',
        k: 3,
        timeoutSec: 10,
        versionAdded: 'test',
        regression: {
          failureMode: 'fixture',
          originalVersion: 'test',
          fixedVersion: 'test',
          fixedBy: 'test',
          expectedResult: 'grader passes',
          status: 'passing',
          traceOrigin: 'synthetic-reconstruction',
        },
      }),
    )
    writeFileSync(join(dir, 'grade.sh'), '#!/usr/bin/env bash\nexit 0\n')
  }
  return suite
}

const SUITE = makeSuite()
afterAll(() => rmSync(SUITE, { recursive: true, force: true }))

const argv = (...args: string[]): string[] => ['bun', 'orchentra', ...args]

function capture(): { out: string; err: string; args: Pick<RunRegressionsArgs, 'stdout' | 'stderr'> } {
  const sink = { out: '', err: '' }
  return {
    get out() {
      return sink.out
    },
    get err() {
      return sink.err
    },
    args: {
      stdout: (t: string) => {
        sink.out += t
      },
      stderr: (t: string) => {
        sink.err += t
      },
    },
  }
}

const grade = (results: Partial<GradeResult>[]) => async (): Promise<GradeResult> => {
  const r = results.shift() ?? results[0] ?? { passed: true }
  return { exitCode: r.passed ? 0 : 1, passed: false, timedOut: false, output: '', ...r }
}
const always = (r: Partial<GradeResult>) => async (): Promise<GradeResult> => ({
  exitCode: r.passed ? 0 : 1,
  passed: false,
  timedOut: false,
  output: '',
  ...r,
})

describe('parseArgs: regressions', () => {
  test('parses the suite selection flags', () => {
    expect(parseArgs(argv('regressions', '--suite', 'evals/regressions', '--k', '5', '--out', 'r.json'))).toEqual({
      kind: 'regressions',
      suite: 'evals/regressions',
      id: undefined,
      category: undefined,
      k: 5,
      out: 'r.json',
      listCategories: false,
    })
  })

  test('accepts inline forms, a category shard, and --list-categories', () => {
    expect(parseArgs(argv('regressions', '--id=reg-one-shot-exit-code', '--category=browser'))).toMatchObject({
      kind: 'regressions',
      id: 'reg-one-shot-exit-code',
      category: 'browser',
    })
    expect(parseArgs(argv('regressions', '--list-categories'))).toMatchObject({ listCategories: true })
  })

  test('rejects unknown arguments and invalid values', () => {
    expect(() => parseArgs(argv('regressions', '--bogus'))).toThrow(/unknown argument/)
    expect(() => parseArgs(argv('regressions', '--category', 'coding'))).toThrow(/invalid category/)
    expect(() => parseArgs(argv('regressions', '--k', '0'))).toThrow(/positive integer/)
  })
})

describe('orchentra regressions', () => {
  test('a clean suite exits 0 and prints a report JSON', async () => {
    const io = capture()
    const code = await runRegressionsCommand({ suite: SUITE, k: 1, grade: always({ passed: true }), ...io.args })

    expect(code).toBe(0)
    const report = JSON.parse(io.out) as RegressionReport
    expect(report.version).toBe(1)
    expect(report.releaseBlocked).toBe(false)
    expect(report.blockers).toEqual([])
    expect(report.entries).toHaveLength(2)
    expect(io.err).toContain('no release blockers')
  })

  // The gate: this exit code is what CI blocks on.
  test('a previously-passing entry that fails exits 1 and names the blocker', async () => {
    const io = capture()
    const code = await runRegressionsCommand({
      suite: SUITE,
      k: 1,
      id: 'reg-one-shot-exit-code',
      grade: always({ passed: false, output: 'expected exit 1, got 0' }),
      ...io.args,
    })

    expect(code).toBe(1)
    const report = JSON.parse(io.out) as RegressionReport
    expect(report.releaseBlocked).toBe(true)
    expect(report.blockers).toEqual(['reg-one-shot-exit-code'])
    expect(io.err).toContain('release:blocker — reg-one-shot-exit-code')
  })

  test('a flake is reported as quarantined with its signature but does not fail the gate', async () => {
    const io = capture()
    const code = await runRegressionsCommand({
      suite: SUITE,
      k: 3,
      id: 'reg-compaction-pair-safe',
      grade: grade([{ passed: true }, { passed: false, output: 'boundary walked past the pair' }, { passed: true }]),
      ...io.args,
    })

    expect(code).toBe(0)
    const report = JSON.parse(io.out) as RegressionReport
    expect(report.quarantined).toEqual(['reg-compaction-pair-safe'])
    expect(report.releaseBlocked).toBe(false)
    expect(io.err).toContain('quarantined: reg-compaction-pair-safe — signature')
    expect(io.err).toContain('never delete it to go green')
  })

  test('--category filters the shard; --list-categories reports what the suite holds', async () => {
    const listed = capture()
    expect(await runRegressionsCommand({ suite: SUITE, listCategories: true, ...listed.args })).toBe(0)
    expect(listed.out).toBe('harness\n')

    const io = capture()
    const code = await runRegressionsCommand({
      suite: SUITE,
      category: 'browser',
      k: 1,
      grade: always({ passed: true }),
      ...io.args,
    })
    // No browser regressions exist yet — an empty shard is an error, not a silent pass.
    expect(code).toBe(1)
    expect(io.err).toContain('no entries matched')
  })

  test('--out writes the report to a file and keeps stdout clean', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-out-'))
    try {
      const io = capture()
      const outPath = join(dir, 'nested', 'report.json')
      const code = await runRegressionsCommand({
        suite: SUITE,
        k: 1,
        out: outPath,
        grade: always({ passed: true }),
        ...io.args,
      })

      expect(code).toBe(0)
      expect(io.out).toBe('')
      const report = JSON.parse(await Bun.file(outPath).text()) as RegressionReport
      expect(report.entries).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('--summary writes markdown naming the quarantined entry and its signature', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-summary-'))
    try {
      const io = capture()
      const summaryPath = join(dir, 'summary.md')
      await runRegressionsCommand({
        suite: SUITE,
        k: 3,
        id: 'reg-compaction-pair-safe',
        summary: summaryPath,
        grade: grade([{ passed: true }, { passed: false, output: 'boundary walked past the pair' }, { passed: true }]),
        ...io.args,
      })

      const md = await Bun.file(summaryPath).text()
      expect(md).toContain('**Quarantined regressions this release:**')
      expect(md).toContain('`reg-compaction-pair-safe` — 2/3 passed — signature')
      expect(md).toContain('never deleted to make the suite green')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Rule 2 visibility only works if the section renders on green runs too.
  test('--summary says "none" explicitly when nothing is quarantined', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-summary-'))
    try {
      const io = capture()
      const summaryPath = join(dir, 'summary.md')
      const code = await runRegressionsCommand({
        suite: SUITE,
        k: 1,
        summary: summaryPath,
        grade: always({ passed: true }),
        ...io.args,
      })

      expect(code).toBe(0)
      const md = await Bun.file(summaryPath).text()
      expect(md).toContain('**Quarantined regressions this release:**')
      expect(md).toContain('none')
      expect(md).not.toContain('release:blocker')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('--summary names the blocker when a previously-passing entry fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'reg-summary-'))
    try {
      const io = capture()
      const summaryPath = join(dir, 'summary.md')
      const code = await runRegressionsCommand({
        suite: SUITE,
        k: 1,
        id: 'reg-one-shot-exit-code',
        summary: summaryPath,
        grade: always({ passed: false, output: 'expected exit 1, got 0' }),
        ...io.args,
      })

      expect(code).toBe(1)
      const md = await Bun.file(summaryPath).text()
      expect(md).toContain('`release:blocker` — previously-passing entries that now fail')
      expect(md).toContain('`reg-one-shot-exit-code` — was passing, now fails 1/1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a missing suite is an error, not an empty pass', async () => {
    const io = capture()
    const code = await runRegressionsCommand({ suite: join(tmpdir(), 'no-such-suite'), ...io.args })
    expect(code).toBe(1)
    expect(io.err).toContain('suite not found')
  })

  test('a self-contained on-disk suite passes through the real grader', async () => {
    const io = capture()
    const code = await runRegressionsCommand({ suite: SUITE, k: 1, ...io.args })

    expect(code).toBe(0)
    const report = JSON.parse(io.out) as RegressionReport
    expect(report.releaseBlocked).toBe(false)
    expect(report.entries).toHaveLength(2)
    for (const entry of report.entries) expect(entry.observedStatus).toBe('passing')
  }, 120000)
})
