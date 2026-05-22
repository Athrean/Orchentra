import { describe, expect, test } from 'bun:test'
import { typewriterStep, type TypewriterState } from '../components/marketing-v2/typewriter'

function baseState(over: Partial<TypewriterState> = {}): TypewriterState {
  return {
    words: ['ab', 'cd'],
    index: 0,
    text: '',
    phase: 'typing',
    type: 10,
    del: 5,
    hold: 100,
    ...over,
  }
}

describe('typewriterStep', () => {
  test('typing — appends next char when word not complete', () => {
    const next = typewriterStep(baseState({ text: '' }))
    expect(next).toEqual({ text: 'a', phase: 'typing', index: 0, delay: 10 })
  })

  test('typing — transitions to holding when word fully typed', () => {
    const next = typewriterStep(baseState({ text: 'ab' }))
    expect(next).toEqual({ text: 'ab', phase: 'holding', index: 0, delay: 100 })
  })

  test('holding — transitions to deleting after hold', () => {
    const next = typewriterStep(baseState({ text: 'ab', phase: 'holding' }))
    expect(next).toEqual({ text: 'ab', phase: 'deleting', index: 0, delay: 100 })
  })

  test('deleting — removes one char while text non-empty', () => {
    const next = typewriterStep(baseState({ text: 'ab', phase: 'deleting' }))
    expect(next).toEqual({ text: 'a', phase: 'deleting', index: 0, delay: 5 })
  })

  test('deleting — advances to next word and re-enters typing when empty', () => {
    const next = typewriterStep(baseState({ text: '', phase: 'deleting', index: 0 }))
    expect(next).toEqual({ text: '', phase: 'typing', index: 1, delay: 10 })
  })

  test('deleting — wraps from last word back to first', () => {
    const next = typewriterStep(baseState({ text: '', phase: 'deleting', index: 1 }))
    expect(next).toEqual({ text: '', phase: 'typing', index: 0, delay: 10 })
  })

  test('full cycle for a single word', () => {
    let s: TypewriterState = baseState({ words: ['hi'] })
    const trace: string[] = []
    for (let n = 0; n < 12; n++) {
      const r = typewriterStep(s)
      trace.push(`${r.phase}:${r.text}:${r.index}`)
      s = { ...s, text: r.text, phase: r.phase, index: r.index }
    }
    expect(trace).toEqual([
      'typing:h:0',
      'typing:hi:0',
      'holding:hi:0',
      'deleting:hi:0',
      'deleting:h:0',
      'deleting::0',
      'typing::0',
      'typing:h:0',
      'typing:hi:0',
      'holding:hi:0',
      'deleting:hi:0',
      'deleting:h:0',
    ])
  })
})
