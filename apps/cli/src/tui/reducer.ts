import type { PermissionMode } from '@orchentra/cli-core'
import { emptyUsage } from '@orchentra/cli-core'
import { PERMISSION_MODE_CYCLE, type SuggestionState, type TranscriptRow, type TuiAction, type TuiState } from './types'

export const HISTORY_CAP = 5000

export function initialState(args: { model: string; mode: PermissionMode; history?: readonly string[] }): TuiState {
  return {
    buffer: '',
    cursor: 0,
    draft: '',
    historyIndex: -1,
    history: args.history ?? [],
    suggestions: emptySuggestions(),
    transcript: [],
    turn: { state: 'idle', startedAt: null, elapsedMs: 0, tokens: emptyUsage() },
    mode: args.mode,
    model: args.model,
    pastes: {},
    exitHintUntil: null,
    streamingRowId: null,
  }
}

export function emptySuggestions(): SuggestionState {
  return { open: false, trigger: null, query: '', items: [], selected: 0, anchorStart: 0 }
}

export function reducer(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'buffer/set':
      return { ...state, buffer: action.buffer, cursor: clampCursor(action.cursor, action.buffer) }

    case 'history/load':
      return { ...state, history: action.entries.slice(-HISTORY_CAP) }

    case 'history/prev': {
      if (state.history.length === 0) return state
      const nextIndex = Math.min(state.historyIndex + 1, state.history.length - 1)
      if (nextIndex === state.historyIndex) return state
      const draft = state.historyIndex === -1 ? state.buffer : state.draft
      const next = state.history[state.history.length - 1 - nextIndex] ?? ''
      return { ...state, historyIndex: nextIndex, draft, buffer: next, cursor: next.length }
    }

    case 'history/next': {
      if (state.historyIndex === -1) return state
      const nextIndex = state.historyIndex - 1
      if (nextIndex === -1) {
        return { ...state, historyIndex: -1, buffer: state.draft, cursor: state.draft.length }
      }
      const next = state.history[state.history.length - 1 - nextIndex] ?? ''
      return { ...state, historyIndex: nextIndex, buffer: next, cursor: next.length }
    }

    case 'history/append': {
      const trimmed = action.text.trim()
      if (trimmed.length === 0) return state
      const last = state.history[state.history.length - 1]
      if (last === trimmed) return state
      const merged = [...state.history, trimmed]
      const trimmedHistory = merged.length > HISTORY_CAP ? merged.slice(merged.length - HISTORY_CAP) : merged
      return { ...state, history: trimmedHistory }
    }

    case 'suggestions/set':
      return { ...state, suggestions: action.state }

    case 'suggestions/close':
      return { ...state, suggestions: emptySuggestions() }

    case 'suggestions/move': {
      if (!state.suggestions.open || state.suggestions.items.length === 0) return state
      const len = state.suggestions.items.length
      const next = (state.suggestions.selected + action.delta + len) % len
      return { ...state, suggestions: { ...state.suggestions, selected: next } }
    }

    case 'transcript/push':
      return { ...state, transcript: [...state.transcript, action.row] }

    case 'transcript/clear':
      return { ...state, transcript: [] }

    case 'transcript/stream-begin': {
      const row: TranscriptRow = { kind: 'assistant', id: action.rowId, text: '' }
      return { ...state, transcript: [...state.transcript, row], streamingRowId: action.rowId }
    }

    case 'transcript/stream-append': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'assistant') return row
        return { ...row, text: row.text + action.delta }
      })
      return { ...state, transcript: next }
    }

    case 'transcript/stream-end':
      return { ...state, streamingRowId: null }

    case 'transcript/system-stream-begin': {
      const row: TranscriptRow = { kind: 'stream', id: action.rowId, text: '', label: action.label }
      return { ...state, transcript: [...state.transcript, row], streamingRowId: action.rowId }
    }

    case 'transcript/system-stream-append': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'stream') return row
        return { ...row, text: row.text + action.delta }
      })
      return { ...state, transcript: next }
    }

    case 'transcript/system-stream-end':
      return { ...state, streamingRowId: null }

    case 'turn/start':
      return {
        ...state,
        turn: { state: 'running', startedAt: Date.now(), elapsedMs: 0, tokens: state.turn.tokens },
      }

    case 'turn/cancelling':
      return { ...state, turn: { ...state.turn, state: 'cancelling' } }

    case 'turn/end':
      return {
        ...state,
        streamingRowId: null,
        turn: { state: 'idle', startedAt: null, elapsedMs: 0, tokens: state.turn.tokens },
      }

    case 'turn/tick':
      if (state.turn.state === 'idle') return state
      return { ...state, turn: { ...state.turn, elapsedMs: action.elapsedMs } }

    case 'tokens/set':
      return { ...state, turn: { ...state.turn, tokens: action.usage } }

    case 'mode/cycle': {
      const idx = PERMISSION_MODE_CYCLE.indexOf(state.mode)
      const next = PERMISSION_MODE_CYCLE[(idx + 1) % PERMISSION_MODE_CYCLE.length]
      return { ...state, mode: next }
    }

    case 'mode/set':
      return { ...state, mode: action.mode }

    case 'model/set':
      return { ...state, model: action.model }

    case 'paste/add':
      return { ...state, pastes: { ...state.pastes, [action.chip.id]: action.chip } }

    case 'exit-hint/show':
      return { ...state, exitHintUntil: action.until }

    case 'exit-hint/clear':
      return { ...state, exitHintUntil: null }
  }
}

function clampCursor(cursor: number, buffer: string): number {
  if (cursor < 0) return 0
  if (cursor > buffer.length) return buffer.length
  return cursor
}
