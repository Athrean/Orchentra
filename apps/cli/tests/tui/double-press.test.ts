import { describe, expect, test } from 'bun:test'
import { doublePressDecision } from '../../src/tui/input/double-press'

describe('doublePressDecision', () => {
  test('a first press arms the window', () => {
    const d = doublePressDecision(null, 1000, 1500)
    expect(d.result).toBe('first')
    expect(d.armedUntil).toBe(2500)
  })

  test('a second press within the window fires and disarms', () => {
    const d = doublePressDecision(2500, 2000, 1500)
    expect(d.result).toBe('again')
    expect(d.armedUntil).toBeNull()
  })

  test('a press exactly on the deadline still counts', () => {
    expect(doublePressDecision(2500, 2500, 1500).result).toBe('again')
  })

  test('a press after the window re-arms instead of firing', () => {
    const d = doublePressDecision(2500, 2501, 1500)
    expect(d.result).toBe('first')
    expect(d.armedUntil).toBe(4001)
  })
})
