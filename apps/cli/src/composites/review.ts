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

export type CorroborationStrength = 'strong' | 'weak'

export interface CorroborationEvidence {
  check: string
  strength: CorroborationStrength
  evidence: string
}

/**
 * A finding plus failing-gate evidence. `corroboratedBy` is retained as a
 * compatibility alias for callers that only need check names.
 */
export type ReviewFinding = Finding & { corroboration: CorroborationEvidence[]; corroboratedBy: string[] }

export interface ReviewResult {
  findings: ReviewFinding[]
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
  memoryGuidance?: string
  spinePrompt?: string
  /** Override the checks to run; defaults to the cwd package.json scripts. */
  checks?: { name: string; command: string }[]
  /** Inject for tests so verification doesn't spawn real processes. */
  run?: CheckRunner
}

const OUTPUT_TAIL = 2000
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')

export async function review(opts: ReviewOptions): Promise<ReviewResult | { error: string }> {
  const scanned = await scan({
    cwd: opts.cwd,
    mode: opts.mode,
    path: opts.path,
    llm: opts.llm,
    memoryGuidance: opts.memoryGuidance,
    spinePrompt: opts.spinePrompt,
  })
  if ('error' in scanned) return scanned

  const checks = opts.checks ?? discoverChecks(opts.cwd)
  const run = opts.run ?? defaultRun
  const executed = checks.map((c) => {
    const r = run(c.command, opts.cwd)
    const check = {
      name: c.name,
      command: c.command,
      passed: r.exitCode === 0,
      exitCode: r.exitCode,
      output: r.output.length > OUTPUT_TAIL ? r.output.slice(-OUTPUT_TAIL) : r.output,
    }
    return { check, fullOutput: r.output }
  })
  const results: VerifiedCheck[] = executed.map((r) => r.check)

  const failed = executed.filter((r) => !r.check.passed)
  const findings: ReviewFinding[] = scanned.findings.map((f) => {
    const corroboration = failed
      .map((r) => corroborateFinding(r.check.name, r.fullOutput, f))
      .filter((e): e is CorroborationEvidence => e !== null)
    return { ...f, corroboration, corroboratedBy: corroboration.map((e) => e.check) }
  })

  return {
    findings,
    checks: results,
    model: scanned.model,
    tokensIn: scanned.tokensIn,
    tokensOut: scanned.tokensOut,
  }
}

interface DiagnosticReference {
  path: string
  line: number | null
  evidence: string
}

function corroborateFinding(check: string, output: string, finding: Finding): CorroborationEvidence | null {
  let best: CorroborationEvidence | null = null
  for (const ref of diagnosticReferences(output)) {
    if (!samePath(ref.path, finding.file)) continue
    const strength = lineStrength(finding.line, ref.line)
    if (best === null || (best.strength === 'weak' && strength === 'strong')) {
      best = { check, strength, evidence: ref.evidence }
    }
  }
  return best
}

function lineStrength(findingLine: number | null, diagnosticLine: number | null): CorroborationStrength {
  if (findingLine === null || diagnosticLine === null) return 'weak'
  return Math.abs(findingLine - diagnosticLine) <= 2 ? 'strong' : 'weak'
}

function diagnosticReferences(output: string): DiagnosticReference[] {
  const refs: DiagnosticReference[] = []
  for (const rawLine of output.split('\n')) {
    const evidence = stripAnsi(rawLine).trim()
    if (evidence.length === 0) continue

    for (const match of regexMatches(/([^\s()'"]+?)\((\d+)(?:,\d+)?\)/g, evidence)) {
      const path = cleanPath(match[1])
      const line = Number(match[2])
      if (path && Number.isInteger(line)) refs.push({ path, line, evidence })
    }

    for (const match of regexMatches(
      /((?:\/|\.{1,2}\/|[\w@.+-]+\/|[\w@.+-]+\.)[^\s()'"]*?):(\d+)(?::\d+)?/g,
      evidence,
    )) {
      const path = cleanPath(match[1])
      const line = Number(match[2])
      if (path && Number.isInteger(line)) refs.push({ path, line, evidence })
    }

    for (const match of regexMatches(
      /((?:\/|\.{1,2}\/|[\w@.+-]+\/)[^\s()'":]+?\.[\w.+-]+|[\w@.+-]+\.[A-Za-z][\w.+-]*)/g,
      evidence,
    )) {
      const path = cleanPath(match[1])
      if (path && path.includes('/')) refs.push({ path, line: null, evidence })
    }
  }
  return refs
}

function regexMatches(pattern: RegExp, value: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value)) !== null) {
    matches.push(match)
    if (match[0].length === 0) pattern.lastIndex++
  }
  return matches
}

function samePath(candidate: string, finding: string): boolean {
  const candidateParts = pathParts(candidate)
  const findingParts = pathParts(finding)
  if (candidateParts.length === 0 || findingParts.length === 0) return false
  if (candidateParts.join('/') === findingParts.join('/')) return true
  if (candidateParts.length === 1 || findingParts.length === 1) return false
  return endsWithParts(candidateParts, findingParts) || endsWithParts(findingParts, candidateParts)
}

function endsWithParts(parts: string[], suffix: string[]): boolean {
  if (suffix.length > parts.length) return false
  return suffix.every((part, i) => part === parts[parts.length - suffix.length + i])
}

function pathParts(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .replace(/^file:\/\//, '')
    .split('/')
    .filter((part) => part.length > 0 && part !== '.')
}

function cleanPath(path: string | undefined): string | null {
  if (!path) return null
  const cleaned = path.replace(/^[([{<'"`]+/, '').replace(/[)\]}>,'"`]+$/, '')
  return cleaned.includes('.') ? cleaned : null
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '')
}

export function discoverChecks(cwd: string): { name: string; command: string }[] {
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

export const defaultRun: CheckRunner = (command, cwd) => {
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf-8', timeout: 180_000 })
  const output = (r.stdout ?? '') + (r.stderr ?? '')
  // status is null on timeout/signal — treat as a failed check.
  return { exitCode: r.status ?? 1, output }
}
