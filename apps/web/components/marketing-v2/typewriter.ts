export type TypewriterPhase = 'typing' | 'holding' | 'deleting'

export interface TypewriterState {
  words: readonly string[]
  index: number
  text: string
  phase: TypewriterPhase
  type: number
  del: number
  hold: number
}

export interface TypewriterNext {
  text: string
  phase: TypewriterPhase
  index: number
  delay: number
}

export function typewriterStep(s: TypewriterState): TypewriterNext {
  const word = s.words[s.index] ?? ''

  if (s.phase === 'typing') {
    if (s.text.length < word.length) {
      return { text: word.slice(0, s.text.length + 1), phase: 'typing', index: s.index, delay: s.type }
    }
    return { text: s.text, phase: 'holding', index: s.index, delay: s.hold }
  }

  if (s.phase === 'holding') {
    return { text: s.text, phase: 'deleting', index: s.index, delay: s.hold }
  }

  if (s.text.length > 0) {
    return { text: word.slice(0, s.text.length - 1), phase: 'deleting', index: s.index, delay: s.del }
  }
  return { text: '', phase: 'typing', index: (s.index + 1) % s.words.length, delay: s.type }
}
