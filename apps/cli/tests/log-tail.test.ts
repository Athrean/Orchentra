import { describe, expect, test } from 'bun:test'
import { tailFailingLog } from '../src/commands/log-tail'

describe('tailFailingLog', () => {
  test('returns logs unchanged when under limit', () => {
    const logs = 'a\nb\nc'
    expect(tailFailingLog(logs, 100)).toBe(logs)
  })

  test('anchors window around last error marker', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line-${i}`)
    lines[250] = '##[error] TypeError at x.ts:10'
    const tail = tailFailingLog(lines.join('\n'), 200)
    expect(tail).toContain('##[error]')
    expect(tail.split('\n').length).toBeLessThanOrEqual(201)
  })

  test('falls back to last N lines when no error marker', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `plain-${i}`)
    const tail = tailFailingLog(lines.join('\n'), 50)
    expect(tail.split('\n').length).toBe(50)
    expect(tail.endsWith('plain-499')).toBe(true)
  })
})
