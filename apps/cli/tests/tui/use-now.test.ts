import { describe, expect, test } from 'bun:test'
import { DIM_TICK_MS } from '../../src/tui/use-now'

describe('useNow', () => {
  test('exports a sane default tick interval', () => {
    expect(DIM_TICK_MS).toBeGreaterThanOrEqual(500)
    expect(DIM_TICK_MS).toBeLessThanOrEqual(3000)
  })
})
