import { describe, expect, test } from 'bun:test'
import { FIGURES } from '../../src/tui/figures'

describe('FIGURES', () => {
  test('every figure is a non-empty glyph', () => {
    for (const [name, glyph] of Object.entries(FIGURES)) {
      expect(glyph.length, name).toBeGreaterThan(0)
    }
  })

  test('exposes the structural marks components use', () => {
    expect(FIGURES.gear).toBe('⚙')
    expect(FIGURES.toolCall).toBe('⏺')
    expect(FIGURES.undo).toBe('↩')
    expect(FIGURES.search).toBe('⌕')
  })
})
