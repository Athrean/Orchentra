import { describe, expect, test } from 'bun:test'
import { selectDueCronSpecs } from '../src/cron/tick'
import type { CronSpecRow } from '../src/cron/tick'

function row(over: Partial<CronSpecRow>): CronSpecRow {
  return {
    id: 'cs-1',
    orgId: 'org-1',
    skillName: 'nightly-health-check',
    cronExpr: '0 9 * * *',
    lastTickedAt: null,
    enabled: 1,
    ...over,
  }
}

describe('selectDueCronSpecs', () => {
  const NOW = new Date('2026-04-28T09:00:00Z')

  test('returns empty when no specs are provided', () => {
    expect(selectDueCronSpecs([], NOW)).toEqual([])
  })

  test('skips disabled specs', () => {
    expect(selectDueCronSpecs([row({ enabled: 0 })], NOW)).toEqual([])
  })

  test('returns specs whose cron expression matches now and have never ticked', () => {
    const out = selectDueCronSpecs([row({ id: 'a' })], NOW)
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  test('skips specs already ticked within the same minute', () => {
    const sameMinute = new Date('2026-04-28T09:00:30Z')
    expect(selectDueCronSpecs([row({ lastTickedAt: sameMinute })], NOW)).toEqual([])
  })

  test('returns specs ticked in a previous minute and matching now', () => {
    const earlier = new Date('2026-04-27T09:00:00Z')
    const out = selectDueCronSpecs([row({ lastTickedAt: earlier })], NOW)
    expect(out.length).toBe(1)
  })

  test('skips specs whose cron expression does not match the current minute', () => {
    const out = selectDueCronSpecs([row({ cronExpr: '0 10 * * *' })], NOW)
    expect(out).toEqual([])
  })

  test('rejects rows with an unparseable cron expression by skipping them', () => {
    const out = selectDueCronSpecs([row({ cronExpr: 'not a cron' })], NOW)
    expect(out).toEqual([])
  })

  test('returns multiple due specs at the same tick', () => {
    const out = selectDueCronSpecs(
      [row({ id: 'a' }), row({ id: 'b', skillName: 'other' }), row({ id: 'c', cronExpr: '0 10 * * *' })],
      NOW,
    )
    expect(out.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })
})
