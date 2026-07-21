import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export type Severity = 'P0' | 'P1' | 'P2'

export interface Finding {
  file: string
  line: number | null
  severity: Severity
  title: string
  description: string
  suggestedFix: string | null
}

export interface ScanResult {
  findings: Finding[]
  model: string
  tokensIn: number
  tokensOut: number
}

/**
 * Inject this so /scan can be tested without a live LLM call. Production
 * wiring builds an LlmCaller from the user's BYOK provider creds; tests
 * supply a deterministic mock that returns canned findings JSON.
 */
export type LlmCaller = (input: { systemPrompt: string; userPrompt: string }) => Promise<{
  text: string
  model: string
  tokensIn: number
  tokensOut: number
}>

const SYSTEM_PROMPT = [
  'You are a strict senior reviewer scanning a code diff for the team.',
  'Return ONLY a JSON array of findings. No prose.',
  'Each finding: { file: string, line: number|null, severity: "P0"|"P1"|"P2", title: string, description: string, suggestedFix: string|null }.',
  'Severity rubric:',
  '  P0 = security flaw, data loss risk, or guaranteed prod break.',
  '  P1 = correctness bug or contract violation.',
  '  P2 = style or maintainability concern.',
  'Return [] if no findings. NEVER invent file paths.',
].join('\n')

export interface ScanOptions {
  cwd: string
  mode: 'diff' | 'full' | 'path'
  path?: string
  llm: LlmCaller
  memoryGuidance?: string
  spinePrompt?: string
}

export async function scan(opts: ScanOptions): Promise<ScanResult | { error: string }> {
  let payload: string
  if (opts.mode === 'diff') {
    const r = spawnSync('git', ['diff', 'origin/main...HEAD'], { cwd: opts.cwd, encoding: 'utf-8', timeout: 5000 })
    if (r.status !== 0) return { error: `git diff failed: ${r.stderr || r.stdout || 'unknown'}` }
    payload = r.stdout
  } else if (opts.mode === 'full') {
    const r = spawnSync('git', ['ls-files'], { cwd: opts.cwd, encoding: 'utf-8', timeout: 5000 })
    if (r.status !== 0) return { error: `git ls-files failed: ${r.stderr || r.stdout || 'unknown'}` }
    const files = r.stdout.split('\n').filter(Boolean).slice(0, 200)
    const chunks = await Promise.all(
      files.map(async (f) => {
        try {
          const body = await readFile(resolve(opts.cwd, f), 'utf-8')
          return `--- ${f} ---\n${body}`
        } catch {
          // skip unreadable
          return null
        }
      }),
    )
    payload = chunks.filter((c): c is string => c !== null).join('\n\n')
  } else {
    if (!opts.path) return { error: 'mode=path requires --path' }
    try {
      payload = await readFile(resolve(opts.cwd, opts.path), 'utf-8')
    } catch (err) {
      return { error: `cannot read ${opts.path}: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  if (payload.trim().length === 0) {
    return { findings: [], model: 'noop', tokensIn: 0, tokensOut: 0 }
  }

  const systemPrompt = [SYSTEM_PROMPT, opts.spinePrompt, opts.memoryGuidance].filter(Boolean).join('\n\n')
  const llm = await opts.llm({ systemPrompt, userPrompt: payload })
  const findings = parseFindings(llm.text)
  if (!findings) return { error: `LLM returned malformed JSON: ${llm.text.slice(0, 200)}` }
  return { findings, model: llm.model, tokensIn: llm.tokensIn, tokensOut: llm.tokensOut }
}

function parseFindings(text: string): Finding[] | null {
  // The model is asked for a JSON array; tolerate ```json fences and stray prose.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  let arr: unknown
  try {
    arr = JSON.parse(candidate.trim())
  } catch {
    return null
  }
  if (!Array.isArray(arr)) return null
  return arr.filter(isFinding)
}

function isFinding(x: unknown): x is Finding {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.file === 'string' &&
    (o.line === null || typeof o.line === 'number') &&
    (o.severity === 'P0' || o.severity === 'P1' || o.severity === 'P2') &&
    typeof o.title === 'string' &&
    typeof o.description === 'string' &&
    (o.suggestedFix === null || typeof o.suggestedFix === 'string')
  )
}
