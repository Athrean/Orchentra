import { describe, expect, test } from 'bun:test'
import { terseModePrompt, isTerseMode } from '../src/runtime/terse'

describe('terse mode', () => {
  test('validates supported modes', () => {
    expect(isTerseMode('off')).toBe(true)
    expect(isTerseMode('lite')).toBe(true)
    expect(isTerseMode('full')).toBe(true)
    expect(isTerseMode('ultra')).toBe(true)
    expect(isTerseMode('tiny')).toBe(false)
  })

  test('off mode emits no prompt text', () => {
    expect(terseModePrompt('off')).toBe('')
  })

  test('active modes include safety carve-outs', () => {
    const prompt = terseModePrompt('ultra')
    expect(prompt.toLowerCase()).toContain('terse output mode')
    expect(prompt).toContain('Do not shorten')
    expect(prompt).toContain('security')
    expect(prompt).toContain('file paths')
  })
})
