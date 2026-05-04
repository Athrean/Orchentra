import type { PermissionMode } from '@orchentra/cli-core'
import { emptyUsage } from '@orchentra/cli-core'
import { pickVerb } from './components/loading-verbs'
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
    turn: { state: 'idle', startedAt: null, elapsedMs: 0, tokens: emptyUsage(), verb: null },
    mode: args.mode,
    model: args.model,
    pastes: {},
    exitHintUntil: null,
    streamingRowId: null,
    activeCard: null,
    activeFlow: null,
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

    case 'transcript/reasoning-begin': {
      const row: TranscriptRow = {
        kind: 'reasoning',
        id: action.rowId,
        text: '',
        startedAt: action.startedAt,
        endedAt: null,
        expanded: false,
      }
      return { ...state, transcript: [...state.transcript, row], streamingRowId: action.rowId }
    }

    case 'transcript/reasoning-append': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'reasoning') return row
        return { ...row, text: row.text + action.delta }
      })
      return { ...state, transcript: next }
    }

    case 'transcript/reasoning-end': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'reasoning') return row
        return { ...row, endedAt: action.endedAt }
      })
      return { ...state, transcript: next, streamingRowId: null }
    }

    case 'reasoning/toggle': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'reasoning') return row
        return { ...row, expanded: !row.expanded }
      })
      return { ...state, transcript: next }
    }

    case 'reasoning/toggle-last': {
      let lastIdx = -1
      for (let i = state.transcript.length - 1; i >= 0; i--) {
        if (state.transcript[i].kind === 'reasoning') {
          lastIdx = i
          break
        }
      }
      if (lastIdx === -1) return state
      const next = state.transcript.map((row, i) => {
        if (i !== lastIdx || row.kind !== 'reasoning') return row
        return { ...row, expanded: !row.expanded }
      })
      return { ...state, transcript: next }
    }

    case 'tool_result/toggle': {
      const next = state.transcript.map((row) => {
        if (row.id !== action.rowId || row.kind !== 'tool_result') return row
        return { ...row, expanded: !row.expanded }
      })
      return { ...state, transcript: next }
    }

    case 'tool_result/toggle-last': {
      let lastIdx = -1
      for (let i = state.transcript.length - 1; i >= 0; i--) {
        if (state.transcript[i].kind === 'tool_result') {
          lastIdx = i
          break
        }
      }
      if (lastIdx === -1) return state
      const next = state.transcript.map((row, i) => {
        if (i !== lastIdx || row.kind !== 'tool_result') return row
        return { ...row, expanded: !row.expanded }
      })
      return { ...state, transcript: next }
    }

    case 'turn/start':
      return {
        ...state,
        turn: {
          state: 'running',
          startedAt: Date.now(),
          elapsedMs: 0,
          tokens: state.turn.tokens,
          verb: pickVerb(),
        },
      }

    case 'turn/cancelling':
      return { ...state, turn: { ...state.turn, state: 'cancelling' } }

    case 'turn/end':
      return {
        ...state,
        streamingRowId: null,
        turn: { state: 'idle', startedAt: null, elapsedMs: 0, tokens: state.turn.tokens, verb: null },
      }

    case 'turn/tick':
      if (state.turn.state === 'idle') return state
      return { ...state, turn: { ...state.turn, elapsedMs: action.elapsedMs } }

    case 'verb/rotate':
      if (state.turn.state === 'idle') return state
      return { ...state, turn: { ...state.turn, verb: action.verb } }

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

    case 'card/open':
      return { ...state, activeCard: action.card }

    case 'card/set-tab': {
      if (!state.activeCard) return state
      const tabs = state.activeCard.tabs
      if (!tabs || tabs.items.length === 0) return state
      const len = tabs.items.length
      const next = ((action.index % len) + len) % len
      return { ...state, activeCard: { ...state.activeCard, activeTab: next } }
    }

    case 'card/dismiss': {
      if (!state.activeCard) return state
      const card = state.activeCard
      const sections = card.sectionsByTab[card.activeTab] ?? []
      const tabName = card.tabs?.items[card.activeTab]
      const subtitle = tabName ? `${card.subtitle ? card.subtitle + ' · ' : ''}${tabName}` : card.subtitle
      const row: TranscriptRow = {
        kind: 'card',
        id: card.id,
        title: card.title,
        subtitle,
        sections,
      }
      return { ...state, activeCard: null, transcript: [...state.transcript, row] }
    }

    case 'flow/start':
      return { ...state, activeFlow: action.flow }

    case 'flow/end':
      return { ...state, activeFlow: null }
  }
}

function clampCursor(cursor: number, buffer: string): number {
  if (cursor < 0) return 0
  if (cursor > buffer.length) return buffer.length
  return cursor
}
