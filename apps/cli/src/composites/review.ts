import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scan, type Finding, type LlmCaller } from './scan'

/**
 * A project check the reviewer actually ran. The LLM findings are an
 * untrusted producer; these executed checks are the trusted checker
 * (CLAUDE.md §10: "the checker is the test suite"). Commands are the
 * project's own scripts — never LLM-chosen — so verification can't run
 * arbitrary shell.
 */
export interface VerifiedCheck {
  name: string
  command: string
  passed: boolean
  exitCode: number
  output: string
}

export interface ReviewResult {
  findings: Finding[]
  checks: VerifiedCheck[]
  model: string
  tokensIn: number
  tokensOut: number
}

export type CheckRunner = (command: string, cwd: string) => { exitCode: number; output: string }

export interface ReviewOptions {
  cwd: string
  mode: 'diff' | 'full' | 'path'
  path?: string
  llm: LlmCaller
  /** Override the checks to run; defaults to the cwd package.json scripts. */
  checks?: { name: string; command: string }[]
  /** Inject for tests so verification doesn't spawn real processes. */
  run?: CheckRunner
}

const OUTPUT_TAIL = 2000

export async function review(opts: ReviewOptions): Promise<ReviewResult | { error: string }> {
  const scanned = await scan({ cwd: opts.cwd, mode: opts.mode, path: opts.path, llm: opts.llm })
  if ('error' in scanned) return scanned

  const checks = opts.checks ?? discoverChecks(opts.cwd)
  const run = opts.run ?? defaultRun
  const results: VerifiedCheck[] = checks.map((c) => {
    const r = run(c.command, opts.cwd)
    return {
      name: c.name,
      command: c.command,
      passed: r.exitCode === 0,
      exitCode: r.exitCode,
      output: r.output.length > OUTPUT_TAIL ? r.output.slice(-OUTPUT_TAIL) : r.output,
    }
  })

  return {
    findings: scanned.findings,
    checks: results,
    model: scanned.model,
    tokensIn: scanned.tokensIn,
    tokensOut: scanned.tokensOut,
  }
}

function discoverChecks(cwd: string): { name: string; command: string }[] {
  let scripts: Record<string, unknown>
  try {
    const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf-8')) as { scripts?: Record<string, unknown> }
    scripts = pkg.scripts ?? {}
  } catch {
    return []
  }
  const out: { name: string; command: string }[] = []
  if (typeof scripts.typecheck === 'string') out.push({ name: 'typecheck', command: 'bun run typecheck' })
  const testScript =
    typeof scripts['test:precommit'] === 'string' ? 'test:precommit' : typeof scripts.test === 'string' ? 'test' : null
  if (testScript) out.push({ name: 'test', command: `bun run ${testScript}` })
  return out
}

const defaultRun: CheckRunner = (command, cwd) => {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf-8', timeout: 180_000 })
  const output = (r.stdout ?? '') + (r.stderr ?? '')
  // status is null on timeout/signal — treat as a failed check.
  return { exitCode: r.status ?? 1, output }
}
