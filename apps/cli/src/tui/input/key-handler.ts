import { randomUUID } from 'node:crypto'
import type { Dispatch } from 'react'
import type { Key } from 'ink'
import type { LiveCli } from '../../live-cli'
import { buildShortcutSections } from '../help/shortcut-sections'
import { evaluatePaste } from '../paste'
import type { ExitHintKey, TuiAction, TuiState } from '../types'
import { deleteWordBack, wordBoundaryLeft, wordBoundaryRight } from '../word-boundary'
import { endsWithBackslashLine, hasUnclosedFence, moveLine } from './motion'
import { doublePressDecision } from './double-press'
import type { Keybindings } from '../keybindings/registry'

/** Window for the double-press-to-exit gate shared by ctrl+c and ctrl+d. */
const EXIT_DOUBLE_PRESS_MS = 1500

/**
 * One tick of the exit double-press for `key`. Returns true when this is the
 * confirming second press (caller should exit); otherwise arms/re-arms the hint
 * for that key and returns false. The armed window is per-key — pressing ctrl+c
 * then ctrl+d re-arms rather than exiting — so the two keys never cross-trigger.
 */
function armExitHint(cur: TuiState, key: ExitHintKey, dispatch: Dispatch<TuiAction>): boolean {
  const armed = cur.exitHintKey === key ? cur.exitHintUntil : null
  const { result, armedUntil } = doublePressDecision(armed, Date.now(), EXIT_DOUBLE_PRESS_MS)
  if (result === 'again') return true
  dispatch({ type: 'exit-hint/show', until: armedUntil ?? Date.now() + EXIT_DOUBLE_PRESS_MS, key })
  return false
}

export type TuiInputKey = Key

export interface MainInputHandlerArgs {
  readonly input: string
  readonly key: TuiInputKey
  readonly state: TuiState
  readonly dispatch: Dispatch<TuiAction>
  readonly cli: LiveCli
  readonly exit: () => void
  readonly chordEditor: (input: string, key: TuiInputKey) => boolean
  readonly submitTurn: (input: string) => Promise<void>
  readonly isMultilineModal: boolean
  readonly collapseMultilineModal: () => void
  readonly keybindings: Keybindings
}

export function handleMainInput(args: MainInputHandlerArgs): void {
  const { input, key, state: cur, dispatch, cli, exit } = args

  // Chord interception (ctrl+x ctrl+e opens $EDITOR). Runs only while a turn
  // is idle; mid-turn the buffer is not the active surface.
  if (cur.turn.state === 'idle' && args.chordEditor(input, key)) return

  // While a turn is running the buffer becomes a type-ahead surface: the user
  // can compose and Enter-queue messages that submit in order once idle.
  // Esc/Ctrl+C still cancel the turn.
  if (cur.turn.state !== 'idle') {
    handleRunningTurnKey(cur, input, key, dispatch, cli)
    return
  }

  // Incremental history reverse-search owns every key while active.
  if (cur.historySearch) {
    handleHistorySearchKey(cur, input, key, dispatch)
    return
  }

  // Declarative global chords (ctrl+l/r/o/f/k/u/w, shift+tab). Resolved from
  // the registry so users can rebind them via keybindings.json; ctrl+c/ctrl+d,
  // submit, and all context-sensitive keys stay in the imperative branches
  // below. Runs before the card/suggestion blocks — those only claim plain
  // arrows/tab/return/esc, which never resolve to a chord action.
  const action = args.keybindings.resolve(input, key)
  if (action !== null) {
    switch (action) {
      case 'cycle-permission-mode':
        return dispatch({ type: 'mode/cycle' })
      case 'clear-transcript':
        return dispatch({ type: 'transcript/clear' })
      case 'toggle-reasoning':
        return dispatch({ type: 'reasoning/toggle-last' })
      case 'toggle-collapsible':
        return dispatch({ type: 'collapsible/toggle-last' })
      case 'command-palette':
        return dispatch({ type: 'flow/start', flow: { kind: 'command-palette' } })
      case 'history-search':
        if (cur.history.length > 0) return dispatch({ type: 'history-search/open' })
        return
      case 'delete-to-line-start':
        return dispatch({ type: 'buffer/set', buffer: cur.buffer.slice(cur.cursor), cursor: 0 })
      case 'delete-word-back': {
        const trimmed = deleteWordBack(cur.buffer, cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: trimmed.buffer, cursor: trimmed.cursor })
      }
    }
  }

  if (cur.activeCard) {
    const tabsLen = cur.activeCard.tabs?.items.length ?? 0
    if (tabsLen > 0 && key.leftArrow) return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab - 1 })
    if (tabsLen > 0 && key.rightArrow) {
      return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab + 1 })
    }
    if (tabsLen > 0 && key.tab) return dispatch({ type: 'card/set-tab', index: cur.activeCard.activeTab + 1 })
    if (key.downArrow || key.escape) return dispatch({ type: 'card/dismiss' })
  }

  if (cur.suggestions.open) {
    if (key.upArrow) return dispatch({ type: 'suggestions/move', delta: -1 })
    if (key.downArrow) return dispatch({ type: 'suggestions/move', delta: 1 })
    if (key.escape) return dispatch({ type: 'suggestions/close' })
    if (key.tab || key.return) {
      const item = cur.suggestions.items[cur.suggestions.selected]
      if (item) {
        const before = cur.buffer.slice(0, cur.suggestions.anchorStart)
        const after = cur.buffer.slice(cur.cursor)
        const insert = `${item.value} `
        const next = `${before}${insert}${after}`
        dispatch({ type: 'buffer/set', buffer: next, cursor: before.length + insert.length })
        dispatch({ type: 'suggestions/close' })
      }
      return
    }
  }

  if (key.ctrl && input === 'c') {
    if (cur.buffer.length > 0) {
      dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
      dispatch({ type: 'exit-hint/clear' })
      return
    }
    if (armExitHint(cur, 'ctrl+c', dispatch)) exit()
    return
  }

  if (key.ctrl && input === 'd') {
    // ctrl+d on an empty buffer exits — gated behind the same double-press as
    // ctrl+c so an accidental tap can't drop the session. With text present it
    // forward-deletes a character as usual.
    if (cur.buffer.length === 0) {
      if (armExitHint(cur, 'ctrl+d', dispatch)) exit()
      return
    }
    if (cur.cursor < cur.buffer.length) {
      const next = cur.buffer.slice(0, cur.cursor) + cur.buffer.slice(cur.cursor + 1)
      dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
    }
    return
  }

  if (input === '?' && cur.buffer.length === 0 && !cur.suggestions.open && !cur.activeCard) {
    dispatch({
      type: 'card/open',
      card: {
        id: randomUUID(),
        title: 'Keyboard shortcuts',
        subtitle: 'Press down or Esc to dismiss',
        activeTab: 0,
        sectionsByTab: [buildShortcutSections(args.keybindings)],
      },
    })
    return
  }

  if (key.leftArrow && (key.meta || key.ctrl)) {
    return dispatch({
      type: 'buffer/set',
      buffer: cur.buffer,
      cursor: wordBoundaryLeft(cur.buffer, cur.cursor),
    })
  }
  if (key.rightArrow && (key.meta || key.ctrl)) {
    return dispatch({
      type: 'buffer/set',
      buffer: cur.buffer,
      cursor: wordBoundaryRight(cur.buffer, cur.cursor),
    })
  }

  if (key.upArrow) {
    const onFirstLine = cur.buffer.indexOf('\n') === -1 || cur.cursor <= cur.buffer.indexOf('\n')
    if (onFirstLine) return dispatch({ type: 'history/prev' })
    return moveLine(cur, -1, dispatch)
  }
  if (key.downArrow) {
    const lastNl = cur.buffer.lastIndexOf('\n')
    const onLastLine = lastNl === -1 || cur.cursor > lastNl
    if (onLastLine) return dispatch({ type: 'history/next' })
    return moveLine(cur, 1, dispatch)
  }
  if (key.leftArrow) {
    return dispatch({ type: 'buffer/set', buffer: cur.buffer, cursor: Math.max(0, cur.cursor - 1) })
  }
  if (key.rightArrow) {
    return dispatch({
      type: 'buffer/set',
      buffer: cur.buffer,
      cursor: Math.min(cur.buffer.length, cur.cursor + 1),
    })
  }

  if (key.return) {
    if (key.shift || key.meta || endsWithBackslashLine(cur.buffer, cur.cursor)) {
      if (endsWithBackslashLine(cur.buffer, cur.cursor)) {
        const next = cur.buffer.slice(0, cur.cursor - 1) + '\n' + cur.buffer.slice(cur.cursor)
        return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
      }
      const next = cur.buffer.slice(0, cur.cursor) + '\n' + cur.buffer.slice(cur.cursor)
      return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 1 })
    }
    if (hasUnclosedFence(cur.buffer)) {
      const next = cur.buffer.slice(0, cur.cursor) + '\n' + cur.buffer.slice(cur.cursor)
      return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 1 })
    }
    void args.submitTurn(cur.buffer)
    return
  }

  if (key.tab) {
    const next = cur.buffer.slice(0, cur.cursor) + '  ' + cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + 2 })
  }

  if (key.backspace || key.delete) {
    if (cur.cursor === 0) return
    const next = cur.buffer.slice(0, cur.cursor - 1) + cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor - 1 })
  }

  if (key.escape) {
    if (args.isMultilineModal) {
      args.collapseMultilineModal()
      return
    }
    if (cur.buffer.length > 0) return dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
    return
  }

  if (input && input.length > 0 && !key.ctrl && !key.meta) {
    const paste = evaluatePaste(input)
    if (paste) {
      dispatch({
        type: 'paste/add',
        chip: { id: paste.chipId, content: paste.content, lines: paste.lines },
      })
      const insert = paste.chipMarker
      const next = cur.buffer.slice(0, cur.cursor) + insert + cur.buffer.slice(cur.cursor)
      return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + insert.length })
    }
    const next = cur.buffer.slice(0, cur.cursor) + input + cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + input.length })
  }
}

/**
 * Key routing while a turn is running: the buffer is a type-ahead composer.
 * Enter queues the current buffer for submission once the runtime goes idle;
 * printable keys, backspace, and left/right edit it; Esc/Ctrl+C cancel the
 * turn. Slash/history/paste affordances stay idle-only for simplicity — the
 * queued text is expanded and routed normally when it finally submits.
 */
function handleRunningTurnKey(
  cur: TuiState,
  input: string,
  key: TuiInputKey,
  dispatch: Dispatch<TuiAction>,
  cli: LiveCli,
): void {
  // Ctrl+C clears an in-progress type-ahead buffer first (mirrors idle mode) so
  // it doesn't kill the turn mid-compose; only an empty buffer cancels. Esc
  // always interrupts — the documented "esc to interrupt" affordance stays.
  if (key.ctrl && input === 'c' && cur.buffer.length > 0) {
    dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
    return
  }
  if ((key.ctrl && input === 'c') || key.escape) {
    if (cur.turn.state === 'running') {
      dispatch({ type: 'turn/cancelling' })
      cli.abort()
    }
    return
  }
  if (key.return && !key.shift && !key.meta) {
    if (cur.buffer.trim().length > 0) {
      dispatch({ type: 'queue/enqueue', text: cur.buffer })
      dispatch({ type: 'buffer/set', buffer: '', cursor: 0 })
    }
    return
  }
  // Up recalls the newest queued message into the buffer to edit or drop it —
  // only when the buffer is empty, so an in-progress compose isn't clobbered.
  if (key.upArrow && cur.buffer.length === 0 && cur.queued.length > 0) {
    return dispatch({ type: 'queue/recall-last' })
  }
  if (key.leftArrow) {
    return dispatch({ type: 'buffer/set', buffer: cur.buffer, cursor: Math.max(0, cur.cursor - 1) })
  }
  if (key.rightArrow) {
    return dispatch({ type: 'buffer/set', buffer: cur.buffer, cursor: Math.min(cur.buffer.length, cur.cursor + 1) })
  }
  if (key.backspace || key.delete) {
    if (cur.cursor === 0) return
    const next = cur.buffer.slice(0, cur.cursor - 1) + cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor - 1 })
  }
  if (input && input.length > 0 && !key.ctrl && !key.meta) {
    const next = cur.buffer.slice(0, cur.cursor) + input + cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor + input.length })
  }
}

/**
 * Key routing while incremental reverse-search is active: printable keys edit
 * the query, ↑/ctrl+f step to older matches, ↓ to newer, Enter accepts the
 * match into the buffer, Esc/ctrl+c/ctrl+g cancel without touching it.
 */
function handleHistorySearchKey(cur: TuiState, input: string, key: TuiInputKey, dispatch: Dispatch<TuiAction>): void {
  const search = cur.historySearch
  if (!search) return
  if (key.return) return dispatch({ type: 'history-search/accept' })
  if (key.escape || (key.ctrl && (input === 'c' || input === 'g'))) {
    return dispatch({ type: 'history-search/cancel' })
  }
  if (key.upArrow || (key.ctrl && input === 'f')) {
    return dispatch({ type: 'history-search/cycle', direction: 'older' })
  }
  if (key.downArrow) return dispatch({ type: 'history-search/cycle', direction: 'newer' })
  if (key.backspace || key.delete) {
    return dispatch({ type: 'history-search/set-query', query: search.query.slice(0, -1) })
  }
  if (input && input.length > 0 && !key.ctrl && !key.meta) {
    return dispatch({ type: 'history-search/set-query', query: search.query + input })
  }
}
