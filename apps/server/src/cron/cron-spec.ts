/**
 * Minimal cron spec parser. Supported subset:
 *
 *   minute   ::= '*' | NUMBER | '*' '/' NUMBER
 *   hour     ::= '*' | NUMBER | '*' '/' NUMBER
 *   dom     ::= '*'
 *   month   ::= '*'
 *   dow     ::= '*'
 *
 * Day-of-month, month, and day-of-week are intentionally limited to '*' for
 * Phase 2. The scheduler that uses this only needs minute + hour granularity
 * for the alert/cron tracer-bullet path. Wider syntax can land later.
 *
 * Times are evaluated in UTC.
 */

export type ParseCronSpecResult = { kind: 'ok'; value: CronSpec } | { kind: 'error'; message: string }

export interface CronSpec {
  matches(date: Date): boolean
}

export function parseCronSpec(input: string): ParseCronSpecResult {
  const trimmed = input.trim()
  if (trimmed.length === 0) return { kind: 'error', message: 'empty cron expression' }

  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) return { kind: 'error', message: `expected 5 fields, got ${parts.length}` }
  const [rawMin, rawHour, rawDom, rawMonth, rawDow] = parts

  if (rawDom !== '*') return { kind: 'error', message: `day-of-month '${rawDom}' not supported in subset; use '*'` }
  if (rawMonth !== '*') return { kind: 'error', message: `month '${rawMonth}' not supported in subset; use '*'` }
  if (rawDow !== '*') return { kind: 'error', message: `day-of-week '${rawDow}' not supported in subset; use '*'` }

  const minute = parseField(rawMin, 0, 59)
  if (minute.kind === 'error') return { kind: 'error', message: `minute: ${minute.message}` }
  const hour = parseField(rawHour, 0, 23)
  if (hour.kind === 'error') return { kind: 'error', message: `hour: ${hour.message}` }

  return {
    kind: 'ok',
    value: {
      matches(date: Date): boolean {
        const m = date.getUTCMinutes()
        const h = date.getUTCHours()
        return minute.value(m) && hour.value(h)
      },
    },
  }
}

type FieldMatcher = (value: number) => boolean
type FieldResult = { kind: 'ok'; value: FieldMatcher } | { kind: 'error'; message: string }

function parseField(raw: string, min: number, max: number): FieldResult {
  if (raw === '*') return { kind: 'ok', value: () => true }

  const stepMatch = /^\*\/(\d+)$/.exec(raw)
  if (stepMatch) {
    const step = Number.parseInt(stepMatch[1], 10)
    if (!Number.isFinite(step) || step <= 0) return { kind: 'error', message: `invalid step '${raw}'` }
    return { kind: 'ok', value: (v) => v % step === 0 }
  }

  if (/^\d+$/.test(raw)) {
    const literal = Number.parseInt(raw, 10)
    if (literal < min || literal > max) {
      return { kind: 'error', message: `literal ${literal} out of range ${min}..${max}` }
    }
    return { kind: 'ok', value: (v) => v === literal }
  }

  return { kind: 'error', message: `unsupported field '${raw}'` }
}
