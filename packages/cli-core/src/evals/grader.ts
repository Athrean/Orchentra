// Binary grader dispatch. Each eval carries one grader; running it is spawning
// a process whose exit code IS the grade — no LLM judge, no re-derivation:
//   - test       → `bash grade.sh`   (runs the fixture's own suite)
//   - playwright  → `bun grade.mjs`   (drives the fixture app via ../lib/browser.mjs)
//   - diff        → `bun grade.mjs`   (structural assertions via ../lib/diff.mjs)
// grade.sh self-locates its fixture via `dirname "$0"`; grade.mjs self-locates
// via `import.meta.dir` and imports `../lib/*.mjs`, so the grader must run inside
// a copy that preserves the `<id>/` + `lib/` layout.

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { EvalGrader } from './types'

export interface GradeResult {
  exitCode: number
  passed: boolean
  timedOut: boolean
  /** Combined stdout+stderr; empty unless `capture` was requested. */
  output: string
}

export interface GradeOptions {
  /**
   * Capture the grader's output instead of discarding it. Off by default: the
   * corpus runner only needs the exit code, while the regression suite needs the
   * text to derive a quarantined entry's failure signature.
   */
  capture?: boolean
}

/** Run the eval's grader against a prepared eval-dir copy; exit 0 = pass. */
export function runGrader(
  evalDirCopy: string,
  grader: EvalGrader,
  timeoutSec: number,
  opts: GradeOptions = {},
): Promise<GradeResult> {
  const [cmd, args] =
    grader === 'test' ? ['bash', [join(evalDirCopy, 'grade.sh')]] : ['bun', [join(evalDirCopy, 'grade.mjs')]]

  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: evalDirCopy, stdio: opts.capture ? 'pipe' : 'ignore' })
    let output = ''
    if (opts.capture) {
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
    }
    let timedOut = false
    const timer = setTimeout(
      () => {
        timedOut = true
        child.kill('SIGKILL')
      },
      Math.max(1, timeoutSec) * 1000,
    )

    child.on('close', (code) => {
      clearTimeout(timer)
      const exitCode = timedOut ? 124 : (code ?? 1)
      resolve({ exitCode, passed: !timedOut && exitCode === 0, timedOut, output })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: 127, passed: false, timedOut, output: output || String(err) })
    })
  })
}
