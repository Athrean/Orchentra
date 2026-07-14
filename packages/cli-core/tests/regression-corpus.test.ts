import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Structure guard for the regression suite (docs/evals/06-REGRESSION-SUITE.md).
// It validates the *shape* of every entry — the schema, the archived trace, and
// the grader's reachability — not the grades themselves (running them is
// `orchentra regressions`). Two guards here are load-bearing:
//
//  - Rule 1 (additions require a trace): the archived trace must parse against
//    the real TraceEvent/TraceManifest schema, and a synthetic reconstruction
//    must say so on disk, not just in meta.json.
//  - Graders must not pass vacuously: a `bun test -t "<name>"` filter that stops
//    matching would run zero tests and exit 0, so every referenced test file
//    must exist and every filter must still appear in it.

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..')
const SUITE_DIR = join(REPO_ROOT, 'evals', 'regressions')

const CATEGORIES = ['harness', 'browser'] as const
const GRADERS = ['test', 'playwright', 'diff'] as const
const STATUSES = ['passing', 'failing', 'quarantined'] as const
const TRACE_ORIGINS = ['recorded', 'synthetic-reconstruction'] as const
const DONE_REASONS = ['stop', 'budget_exhausted', 'aborted', 'error', 'max_steps', 'cost_exhausted', 'loop_detected']

interface Meta {
  id: string
  category: (typeof CATEGORIES)[number]
  grader: (typeof GRADERS)[number]
  k: number
  timeoutSec: number
  versionAdded: string
  regression: {
    failureMode: string
    originalVersion: string
    fixedVersion: string
    fixedBy: string
    expectedResult: string
    status: (typeof STATUSES)[number]
    traceOrigin: (typeof TRACE_ORIGINS)[number]
    failureSignature?: string
  }
}

function entryDirs(): string[] {
  if (!existsSync(SUITE_DIR)) return []
  return readdirSync(SUITE_DIR)
    .filter((name) => !name.startsWith('.') && name !== 'README.md')
    .filter((name) => statSync(join(SUITE_DIR, name)).isDirectory())
    .sort()
}

function readMeta(dir: string): Meta {
  return JSON.parse(readFileSync(join(SUITE_DIR, dir, 'meta.json'), 'utf8')) as Meta
}

/** `bun test <path> -t "<filter>"` pairs referenced by an entry's grade.sh. */
function graderTestTargets(dir: string): { file: string; filter: string | null }[] {
  const script = readFileSync(join(SUITE_DIR, dir, 'grade.sh'), 'utf8')
  const targets: { file: string; filter: string | null }[] = []
  for (const line of script.split('\n')) {
    const m = /bun test (\S+)(?:\s+-t\s+"([^"]+)")?/.exec(line)
    if (m) targets.push({ file: m[1]!, filter: m[2] ?? null })
  }
  return targets
}

const dirs = entryDirs()

describe('regression suite structure', () => {
  test('suite directory exists and is populated', () => {
    expect(existsSync(SUITE_DIR)).toBe(true)
    expect(dirs.length).toBeGreaterThan(0)
  })

  test.each(dirs)('%s has a well-formed meta.json', (dir) => {
    const meta = readMeta(dir)
    expect(meta.id).toBe(dir)
    expect(CATEGORIES).toContain(meta.category)
    expect(GRADERS).toContain(meta.grader)
    expect(Number.isInteger(meta.k)).toBe(true)
    expect(meta.k).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(meta.timeoutSec)).toBe(true)
    expect(meta.timeoutSec).toBeGreaterThanOrEqual(1)
    expect(typeof meta.versionAdded).toBe('string')
    // Browser regressions can only be graded by operating the rendered product.
    if (meta.category === 'browser') expect(meta.grader).toBe('playwright')

    const r = meta.regression
    expect(r.failureMode.length).toBeGreaterThan(0)
    expect(r.originalVersion.length).toBeGreaterThan(0)
    expect(r.fixedVersion.length).toBeGreaterThan(0)
    expect(r.fixedBy.length).toBeGreaterThan(0)
    expect(r.expectedResult.length).toBeGreaterThan(0)
    expect(STATUSES).toContain(r.status)
    expect(TRACE_ORIGINS).toContain(r.traceOrigin)
    // Rule 2: a quarantined entry carries the signature it was quarantined for.
    if (r.status === 'quarantined') expect(r.failureSignature?.length ?? 0).toBeGreaterThan(0)
  })

  test.each(dirs)('%s has task.md and the grader file its meta declares', (dir) => {
    const meta = readMeta(dir)
    const base = join(SUITE_DIR, dir)
    expect(existsSync(join(base, 'task.md'))).toBe(true)
    expect(existsSync(join(base, meta.grader === 'test' ? 'grade.sh' : 'grade.mjs'))).toBe(true)
  })

  // Rule 1: additions require a trace.
  test.each(dirs)('%s archives a schema-valid original failing trace', (dir) => {
    const traceDir = join(SUITE_DIR, dir, 'trace')
    expect(statSync(traceDir).isDirectory()).toBe(true)

    const events = readFileSync(join(traceDir, 'events.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { kind?: string })
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) expect(typeof ev.kind).toBe('string')
    expect(events.at(-1)?.kind).toBe('done')

    const manifest = JSON.parse(readFileSync(join(traceDir, 'manifest.json'), 'utf8')) as Record<string, unknown>
    expect(DONE_REASONS).toContain(manifest.doneReason as string)
    expect(typeof manifest.task).toBe('string')
    expect(typeof manifest.steps).toBe('number')
    expect(manifest.usage).toBeDefined()
    // The trace is of the version that failed, not of the fix.
    expect(manifest.harnessVersion).toBe(readMeta(dir).regression.originalVersion)
  })

  // A reconstruction must be legible as one from the artifact alone — a reader
  // opening the trace without meta.json must not mistake it for a real run.
  test.each(dirs)('%s labels a synthetic trace on disk, not just in meta.json', (dir) => {
    const meta = readMeta(dir)
    const manifest = JSON.parse(readFileSync(join(SUITE_DIR, dir, 'trace', 'manifest.json'), 'utf8')) as {
      traceId: string
      sessionId: string
    }
    if (meta.regression.traceOrigin === 'synthetic-reconstruction') {
      expect(manifest.traceId).toBe(`synthetic-${dir}`)
      expect(manifest.sessionId).toBe('synthetic-reconstruction')
    } else {
      expect(manifest.traceId.startsWith('synthetic-')).toBe(false)
    }
  })

  // Graders must fail loudly rather than pass vacuously.
  test.each(dirs.filter((d) => readMeta(d).grader === 'test'))('%s grade.sh targets tests that exist', (dir) => {
    const targets = graderTestTargets(dir)
    expect(targets.length).toBeGreaterThan(0)
    for (const { file, filter } of targets) {
      const testFile = join(REPO_ROOT, file)
      expect(existsSync(testFile)).toBe(true)
      if (filter) expect(readFileSync(testFile, 'utf8')).toContain(filter)
    }
  })

  test('the four founding entries from 06-REGRESSION-SUITE.md are promoted', () => {
    expect(dirs).toEqual([
      'reg-compaction-pair-safe',
      'reg-diagnostics-permission-gate',
      'reg-forced-compaction-durable',
      'reg-one-shot-exit-code',
    ])
  })
})
