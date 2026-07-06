import { randomUUID } from 'node:crypto'
import type { Dispatch } from 'react'
import type { Key } from 'ink'
import type { LiveCli } from '../../live-cli'
import { SHORTCUT_SECTIONS } from '../help/shortcut-sections'
import { evaluatePaste } from '../paste'
import type { TuiAction, TuiState } from '../types'
import { deleteWordBack, wordBoundaryLeft, wordBoundaryRight } from '../word-boundary'
import { endsWithBackslashLine, hasUnclosedFence, moveLine } from './motion'

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
}

export function handleMainInput(args: MainInputHandlerArgs): void {
  const { input, key, state: cur, dispatch, cli, exit } = args

  // Chord interception (ctrl+x ctrl+e opens $EDITOR). Runs only while a turn
  // is idle; mid-turn the buffer is not the active surface.
  if (cur.turn.state === 'idle' && args.chordEditor(input, key)) return

  // While a turn is running, only Esc/Ctrl+C can do anything useful.
  if (cur.turn.state !== 'idle') {
    if (key.ctrl && input === 'c') {
      if (cur.turn.state === 'running') {
        dispatch({ type: 'turn/cancelling' })
        cli.abort()
      }
      return
    }
    if (key.escape) {
      if (cur.turn.state === 'running') {
        dispatch({ type: 'turn/cancelling' })
        cli.abort()
      }
      return
    }
    return
  }

  if (key.shift && key.tab) {
    dispatch({ type: 'mode/cycle' })
    return
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
    if (cur.exitHintUntil !== null) {
      exit()
      return
    }
    dispatch({ type: 'exit-hint/show', until: Date.now() + 1500 })
    return
  }

  if (key.ctrl && input === 'd') {
    if (cur.buffer.length === 0) {
      exit()
      return
    }
    if (cur.cursor < cur.buffer.length) {
      const next = cur.buffer.slice(0, cur.cursor) + cur.buffer.slice(cur.cursor + 1)
      dispatch({ type: 'buffer/set', buffer: next, cursor: cur.cursor })
    }
    return
  }

  if (key.ctrl && input === 'l') return dispatch({ type: 'transcript/clear' })
  if (key.ctrl && input === 'r') return dispatch({ type: 'reasoning/toggle-last' })
  if (key.ctrl && input === 'o') return dispatch({ type: 'collapsible/toggle-last' })

  if (key.ctrl && input === 'k') {
    dispatch({ type: 'flow/start', flow: { kind: 'command-palette' } })
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
        sectionsByTab: [SHORTCUT_SECTIONS],
      },
    })
    return
  }

  if (key.ctrl && input === 'u') {
    const next = cur.buffer.slice(cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: next, cursor: 0 })
  }

  if (key.ctrl && input === 'w') {
    const trimmed = deleteWordBack(cur.buffer, cur.cursor)
    return dispatch({ type: 'buffer/set', buffer: trimmed.buffer, cursor: trimmed.cursor })
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
