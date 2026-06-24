import { describe, expect, test } from 'bun:test'
import { parseDiagnostics, diagnosticsReport } from '../src/diagnostics'

describe('parseDiagnostics', () => {
  test('parses a tsc error line into a structured diagnostic', () => {
    const raw = "src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'."
    expect(parseDiagnostics(raw)).toEqual([
      {
        file: 'src/foo.ts',
        line: 12,
        col: 5,
        severity: 'error',
        message: "TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ])
  })

  test('parses warnings and a generic file:line:col form, ignoring noise', () => {
    const raw = [
      'Compiling...',
      'src/a.ts(2,1): warning TS6133: unused.',
      'src/b.ts:7:3: error: Unexpected token',
      '',
      'Found 2 errors.',
    ].join('\n')
    expect(parseDiagnostics(raw)).toEqual([
      { file: 'src/a.ts', line: 2, col: 1, severity: 'warning', message: 'TS6133: unused.' },
      { file: 'src/b.ts', line: 7, col: 3, severity: 'error', message: 'Unexpected token' },
    ])
  })
})

describe('diagnosticsReport', () => {
  test('dedupes, orders errors before warnings, and summarizes', () => {
    const raw = [
      'src/a.ts(2,1): warning TS6133: unused.',
      'src/b.ts(5,3): error TS2322: bad type.',
      'src/b.ts(5,3): error TS2322: bad type.',
    ].join('\n')
    const r = diagnosticsReport(raw)
    expect(r.errors).toBe(1)
    expect(r.warnings).toBe(1)
    expect(r.diagnostics.map((d) => d.severity)).toEqual(['error', 'warning'])
    expect(r.text).toContain('src/b.ts:5:3: error: TS2322: bad type.')
    expect(r.text).toContain('1 error, 1 warning')
  })

  test('reports a clean run', () => {
    expect(diagnosticsReport('Compiling...\nDone.').text).toBe('no diagnostics')
  })

  test('caps the rendered list and notes how many are hidden', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `src/f${i}.ts(1,1): error TSX: msg${i}.`)
    const r = diagnosticsReport(lines.join('\n'), 3)
    expect(r.errors).toBe(5)
    expect((r.text.match(/ error: /g) ?? []).length).toBe(3)
    expect(r.text).toContain('+2 more')
  })
})
