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
  function sample(): string {
    return renderFixBody({
      runUrl: 'https://github.com/o/r/actions/runs/42',
      runId: 42,
      idempotencyKey: 'deadbeef',
      bug: 'test runner failed on assertion',
      fix: 'Patched 1 file on `orchentra/fix/run-42`.',
      reasoning: 'Minimum delta to make checks green.',
    })
  }

  test('has exactly three labeled sections in order: Bug, Fix, Reasoning', () => {
    const body = sample()
    const idxBug = body.indexOf('**Bug.**')
    const idxFix = body.indexOf('**Fix.**')
    const idxReasoning = body.indexOf('**Reasoning.**')
    expect(idxBug).toBeGreaterThan(-1)
    expect(idxFix).toBeGreaterThan(idxBug)
    expect(idxReasoning).toBeGreaterThan(idxFix)
  })

  test('does not include legacy boilerplate sections', () => {
    const body = sample()
    expect(body).not.toContain('## Orchentra fix for run')
    expect(body).not.toContain('Test plan')
    expect(body).not.toContain('Failing run:')
    expect(body).not.toContain('Idempotency key:')
  })

  test('Fix section anchors to the failing run', () => {
    const body = sample()
    expect(body).toContain('https://github.com/o/r/actions/runs/42')
    expect(body).toContain('run #42')
  })

  test('idempotency marker is preserved (single key=… form)', () => {
    const body = sample()
    expect(body).toContain('<!-- orchentra:fix-pr key=deadbeef -->')
  })

  test('collapses multi-line input to single line per section', () => {
    const body = renderFixBody({
      runUrl: 'https://example.com',
      runId: 1,
      idempotencyKey: 'k',
      bug: 'first\nsecond\nthird',
      fix: 'a  b   c',
      reasoning: '   r   ',
    })
    expect(body).toContain('**Bug.** first second third')
    expect(body).toContain('**Fix.** a b c')
    expect(body).toContain('**Reasoning.** r')
  })
})
