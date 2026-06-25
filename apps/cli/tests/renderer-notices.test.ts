import { describe, expect, test } from 'bun:test'
import { memorySavedText, costWarningText } from '../src/renderer'

describe('memorySavedText', () => {
  test('shows a short id and how to inspect it', () => {
    const text = memorySavedText('11111111-2222-3333-4444-555555555555')
    expect(text).toContain('11111111')
    expect(text).toContain('/memory show 11111111')
    expect(text).not.toContain('555555555555') // short prefix only
  })
})

describe('costWarningText', () => {
  test('reports spend, threshold, and cap', () => {
    expect(costWarningText(0.42, 0.25, 1)).toBe(
      'Cost warning: estimated spend $0.4200 crossed the $0.2500 threshold (cap $1.0000)',
    )
  })

  test('omits the cap when none is configured', () => {
    expect(costWarningText(0.42, 0.25)).toBe('Cost warning: estimated spend $0.4200 crossed the $0.2500 threshold')
  })
})
