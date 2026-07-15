import { describe, expect, test } from 'bun:test'
import type { GradeResult } from '../../src/evals/grader'
import {
  buildRegressionReport,
  isBlocker,
  observedStatus,
  runRegressionEntries,
  runRegressionEntry,
  type RegressionEntry,
  type RegressionStatus,
} from '../../src/evals/regressions'

const SUITE = '/tmp/orchentra-regression-test-suite'

const graded = (results: Partial<GradeResult>[]): ((e: RegressionEntry) => Promise<GradeResult>) => {
  let i = 0
  return async () => {
    const r = results[Math.min(i++, results.length - 1)]!
    return { exitCode: r.passed ? 0 : 1, passed: false, timedOut: false, output: '', ...r }
  }
}
const pass: Partial<GradeResult> = { passed: true, exitCode: 0 }
const fail: Partial<GradeResult> = { passed: false, exitCode: 1, output: 'error: expected 3, got 2' }

function entry(status: RegressionStatus, k = 3): RegressionEntry {
  return {
    dir: '/nonexistent',
    meta: {
      id: 'reg-example',
      category: 'harness',
      grader: 'test',
      k,
      timeoutSec: 60,
      versionAdded: '0.6.0',
      regression: {
        failureMode: 'false-done',
        originalVersion: '0.1.0',
        fixedVersion: '0.2.0',
        fixedBy: 'PR #1',
        expectedResult: 'it holds',
        status,
        traceOrigin: 'recorded',
      },
    },
  }
}

describe('observedStatus', () => {
  test('k/k passes, 0/k fails, anything between is quarantined — never rounded', () => {
    expect(observedStatus(3, 3)).toBe('passing')
    expect(observedStatus(0, 3)).toBe('failing')
    expect(observedStatus(1, 3)).toBe('quarantined')
    expect(observedStatus(2, 3)).toBe('quarantined')
  })
})

describe('isBlocker', () => {
  test('only a previously-passing entry failing outright blocks the release', () => {
    expect(isBlocker('passing', 'failing')).toBe(true)
    // A flake is quarantined and visible, not a red CI on every re-run.
    expect(isBlocker('passing', 'quarantined')).toBe(false)
    expect(isBlocker('passing', 'passing')).toBe(false)
    // Known states are not new regressions.
    expect(isBlocker('failing', 'failing')).toBe(false)
    expect(isBlocker('quarantined', 'failing')).toBe(false)
  })
})

describe('runRegressionEntry', () => {
  test('a passing entry that still passes k/k is clean', async () => {
    const out = await runRegressionEntry(entry('passing'), { grade: graded([pass]) })
    expect(out.trials).toBe(3)
    expect(out.passes).toBe(3)
    expect(out.observedStatus).toBe('passing')
    expect(out.blocker).toBe(false)
    expect(out.quarantined).toBe(false)
    expect(out.failure).toBeNull()
  })

  test('a passing entry failing every trial is a blocker and carries its signature', async () => {
    const out = await runRegressionEntry(entry('passing'), { grade: graded([fail]) })
    expect(out.observedStatus).toBe('failing')
    expect(out.blocker).toBe(true)
    expect(out.passes).toBe(0)
    expect(out.failure?.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(out.failure?.normalizedLog).toContain('expected')
  })

  test('a flaky entry is quarantined with a signature, not deleted or failed', async () => {
    const out = await runRegressionEntry(entry('passing'), { grade: graded([pass, fail, pass]) })
    expect(out.passes).toBe(2)
    expect(out.observedStatus).toBe('quarantined')
    expect(out.quarantined).toBe(true)
    expect(out.blocker).toBe(false)
    expect(out.failure?.hash).toBeTruthy()
  })

  test('an entry recorded quarantined stays visible even when it passes k/k', async () => {
    const out = await runRegressionEntry(entry('quarantined'), { grade: graded([pass]) })
    expect(out.observedStatus).toBe('passing')
    expect(out.quarantined).toBe(true)
    expect(out.blocker).toBe(false)
  })

  test('the failure signature redacts secrets from grader output', async () => {
    const leaky = {
      passed: false,
      exitCode: 1,
      output: 'auth failed: ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrstuvwxyz',
    }
    const out = await runRegressionEntry(entry('passing'), { grade: graded([leaky]) })
    expect(out.failure?.normalizedLog).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz')
    expect(out.failure?.normalizedLog).toContain('<REDACTED>')
  })

  test('k override wins over meta.k', async () => {
    const out = await runRegressionEntry(entry('passing', 3), { k: 1, grade: graded([pass]) })
    expect(out.trials).toBe(1)
  })
})

describe('buildRegressionReport', () => {
  test('blocks the release on a blocker and lists quarantined ids either way', async () => {
    const outcomes = await runRegressionEntries(
      [
        { ...entry('passing'), meta: { ...entry('passing').meta, id: 'reg-broken' } },
        { ...entry('passing'), meta: { ...entry('passing').meta, id: 'reg-flaky' } },
      ],
      { grade: graded([fail]) },
    )
    // Both ran the same scripted grader; hand-set the second to a flake.
    const flaky = await runRegressionEntry(
      { ...entry('passing'), meta: { ...entry('passing').meta, id: 'reg-flaky' } },
      { grade: graded([pass, fail, pass]) },
    )
    const report = buildRegressionReport([outcomes[0]!, flaky], { suite: SUITE, harness: '0.6.0' })

    expect(report.releaseBlocked).toBe(true)
    expect(report.blockers).toEqual(['reg-broken'])
    expect(report.quarantined).toEqual(['reg-flaky'])
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  test('a clean run does not block the release', () => {
    const report = buildRegressionReport([], { suite: SUITE, harness: '0.6.0' })
    expect(report.releaseBlocked).toBe(false)
    expect(report.blockers).toEqual([])
  })
})
