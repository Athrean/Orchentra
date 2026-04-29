import { describe, expect, test } from 'bun:test'
import { parseCronSpec } from '../src/cron/cron-spec'

function date(iso: string): Date {
  return new Date(iso)
}

describe('parseCronSpec', () => {
  test('rejects malformed expressions', () => {
    expect(parseCronSpec('').kind).toBe('error')
    expect(parseCronSpec('not a cron').kind).toBe('error')
    expect(parseCronSpec('* * *').kind).toBe('error') // wrong field count
    expect(parseCronSpec('60 * * * *').kind).toBe('error') // minute out of range
    expect(parseCronSpec('* 24 * * *').kind).toBe('error') // hour out of range
  })

  test('"* * * * *" matches every minute', () => {
    const spec = parseCronSpec('* * * * *')
    expect(spec.kind).toBe('ok')
    if (spec.kind !== 'ok') return
    expect(spec.value.matches(date('2026-04-28T13:07:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T00:00:00Z'))).toBe(true)
  })

  test('"*/5 * * * *" matches only minutes divisible by 5', () => {
    const spec = parseCronSpec('*/5 * * * *')
    expect(spec.kind).toBe('ok')
    if (spec.kind !== 'ok') return
    expect(spec.value.matches(date('2026-04-28T13:00:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T13:05:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T13:30:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T13:01:00Z'))).toBe(false)
    expect(spec.value.matches(date('2026-04-28T13:07:00Z'))).toBe(false)
  })

  test('"0 9 * * *" matches 09:00 UTC every day', () => {
    const spec = parseCronSpec('0 9 * * *')
    expect(spec.kind).toBe('ok')
    if (spec.kind !== 'ok') return
    expect(spec.value.matches(date('2026-04-28T09:00:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T09:01:00Z'))).toBe(false)
    expect(spec.value.matches(date('2026-04-28T10:00:00Z'))).toBe(false)
  })

  test('"30 */2 * * *" combines literal minute with stepped hour', () => {
    const spec = parseCronSpec('30 */2 * * *')
    expect(spec.kind).toBe('ok')
    if (spec.kind !== 'ok') return
    expect(spec.value.matches(date('2026-04-28T00:30:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T02:30:00Z'))).toBe(true)
    expect(spec.value.matches(date('2026-04-28T01:30:00Z'))).toBe(false)
    expect(spec.value.matches(date('2026-04-28T02:00:00Z'))).toBe(false)
  })

  test('day-of-month, month, day-of-week wildcards are accepted but only "*" is supported in this subset', () => {
    expect(parseCronSpec('0 9 1 * *').kind).toBe('error') // explicit DOM not yet supported
    expect(parseCronSpec('0 9 * 1 *').kind).toBe('error') // explicit month not yet supported
    expect(parseCronSpec('0 9 * * 1').kind).toBe('error') // explicit DOW not yet supported
  })

  test('whitespace tolerance', () => {
    expect(parseCronSpec('  */5   *  *  *  *  ').kind).toBe('ok')
  })
})
