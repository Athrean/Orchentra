import type { Dispatch } from 'react'
import type { TuiAction, TuiState } from '../types'

export function moveLine(state: TuiState, delta: -1 | 1, dispatch: Dispatch<TuiAction>): void {
  const lines = state.buffer.split('\n')
  let lineIdx = 0
  let consumed = 0
  let column = state.cursor
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length
    if (state.cursor <= consumed + len) {
      lineIdx = i
      column = state.cursor - consumed
      break
    }
    consumed += len + 1
  }
  const target = lineIdx + delta
  if (target < 0 || target >= lines.length) return
  const targetCol = Math.min(column, lines[target].length)
  let pos = 0
  for (let i = 0; i < target; i++) pos += lines[i].length + 1
  pos += targetCol
  dispatch({ type: 'buffer/set', buffer: state.buffer, cursor: pos })
}

export function endsWithBackslashLine(buffer: string, cursor: number): boolean {
  if (cursor === 0) return false
  return buffer[cursor - 1] === '\\'
}

export function hasUnclosedFence(buffer: string): boolean {
  let count = 0
  for (let i = 0; i < buffer.length - 2; i++) {
    if (buffer[i] === '`' && buffer[i + 1] === '`' && buffer[i + 2] === '`') {
      count += 1
      i += 2
    }
  }
  return count % 2 === 1
}
