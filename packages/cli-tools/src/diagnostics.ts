// Workspace diagnostics: parse a type/lint command's output into structured,
// deduped, capped findings. Substance behind the `diagnostics` tool (H2) — the
// tool is a thin runner that pipes command output through diagnosticsReport.
// Keeping only errors+warnings (file:line) closes the write-less loop: the agent
// sees what an edit broke without re-reading raw compiler noise.

export type Severity = 'error' | 'warning'

export interface Diagnostic {
  file: string
  line: number
  col?: number
  severity: Severity
  message: string
}

// tsc:      src/foo.ts(12,5): error TS2322: message
const TSC_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(.+)$/
// generic:  src/b.ts:7:3: error: message   (gcc/clang/eslint-unix style)
const COLON_RE = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/

export function parseDiagnostics(raw: string): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const lineText of raw.split('\n')) {
    const m = TSC_RE.exec(lineText.trim()) ?? COLON_RE.exec(lineText.trim())
    if (m) {
      out.push({
        file: m[1]!,
        line: Number(m[2]),
        col: Number(m[3]),
        severity: m[4] as Severity,
        message: m[5]!,
      })
    }
  }
  return out
}

export interface DiagnosticsReport {
  /** Deduped, errors-first, NOT capped. */
  diagnostics: Diagnostic[]
  errors: number
  warnings: number
  /** Formatted for display, capped at `max` lines with a "+N more" note. */
  text: string
}

function key(d: Diagnostic): string {
  return `${d.file}:${d.line}:${d.col ?? ''}:${d.severity}:${d.message}`
}

function render(d: Diagnostic): string {
  const loc = d.col === undefined ? `${d.file}:${d.line}` : `${d.file}:${d.line}:${d.col}`
  return `${loc}: ${d.severity}: ${d.message}`
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Parse → dedupe → order errors-first → cap → format. The substance of the `diagnostics` tool. */
export function diagnosticsReport(raw: string, max = 50): DiagnosticsReport {
  const seen = new Set<string>()
  const deduped: Diagnostic[] = []
  for (const d of parseDiagnostics(raw)) {
    const k = key(d)
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(d)
  }
  deduped.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))

  const errors = deduped.filter((d) => d.severity === 'error').length
  const warnings = deduped.length - errors

  if (deduped.length === 0) {
    return { diagnostics: deduped, errors, warnings, text: 'no diagnostics' }
  }

  const shown = deduped.slice(0, max).map(render)
  const hidden = deduped.length - shown.length
  if (hidden > 0) shown.push(`… +${hidden} more`)
  shown.push(`${plural(errors, 'error')}, ${plural(warnings, 'warning')}`)

  return { diagnostics: deduped, errors, warnings, text: shown.join('\n') }
}
