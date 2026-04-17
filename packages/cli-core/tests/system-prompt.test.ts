import { describe, expect, test } from 'bun:test'
import { buildSystemPrompt } from '../src/runtime/system-prompt'

describe('buildSystemPrompt', () => {
  test('joins static and dynamic separately', () => {
    const sp = buildSystemPrompt({
      staticParts: ['agent instructions', 'output rules'],
      dynamicParts: ['incident ctx'],
    })
    expect(sp.static).toBe('agent instructions\n\noutput rules')
    expect(sp.dynamic).toBe('incident ctx')
  })

  test('filters empty parts', () => {
    const sp = buildSystemPrompt({
      staticParts: ['a', '', '  ', 'b'],
      dynamicParts: [],
    })
    expect(sp.static).toBe('a\n\nb')
    expect(sp.dynamic).toBe('')
  })
})
