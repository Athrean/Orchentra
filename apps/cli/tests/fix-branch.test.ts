import { describe, expect, test } from 'bun:test'
import { defaultFixTitle, fixBranchName, idempotencyKey, renderFixBody } from '../src/commands/fix-branch'

describe('fixBranchName', () => {
  test('derives deterministic branch from run id', () => {
    expect(fixBranchName({ runId: 42 })).toBe('orchentra/fix/run-42')
    expect(fixBranchName({ runId: 42 })).toBe(fixBranchName({ runId: 42 }))
  })
})

describe('defaultFixTitle', () => {
  test('includes run name and id', () => {
    expect(defaultFixTitle('CI', 42)).toBe('fix(ci): CI restore run #42')
  })

  test('omits run name when null', () => {
    expect(defaultFixTitle(null, 7)).toBe('fix(ci): restore run #7')
  })

  test('truncates to 120 chars', () => {
    const longName = 'x'.repeat(200)
    expect(defaultFixTitle(longName, 1).length).toBeLessThanOrEqual(120)
  })
})

describe('idempotencyKey', () => {
  test('is stable for identical inputs', () => {
    const a = idempotencyKey('orchentra/fix/run-1', 'main', 'fix(ci): x')
    const b = idempotencyKey('orchentra/fix/run-1', 'main', 'fix(ci): x')
    expect(a).toBe(b)
    expect(a).toHaveLength(16)
  })

  test('changes when any component changes', () => {
    const base = idempotencyKey('head', 'main', 'title')
    expect(idempotencyKey('other', 'main', 'title')).not.toBe(base)
    expect(idempotencyKey('head', 'develop', 'title')).not.toBe(base)
    expect(idempotencyKey('head', 'main', 'different')).not.toBe(base)
  })
})

describe('renderFixBody', () => {
  test('includes run link, summary, and idempotency marker', () => {
    const body = renderFixBody({
      runUrl: 'https://github.com/o/r/actions/runs/42',
      runId: 42,
      idempotencyKey: 'deadbeef',
      summary: '1 job failed',
    })
    expect(body).toContain('https://github.com/o/r/actions/runs/42')
    expect(body).toContain('1 job failed')
    expect(body).toContain('`deadbeef`')
    expect(body).toContain('<!-- orchentra:fix-pr -->')
  })
})
