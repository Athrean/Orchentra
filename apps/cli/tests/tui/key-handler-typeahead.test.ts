import { describe, expect, test } from 'bun:test'
import type { Key } from 'ink'
import { handleMainInput, type MainInputHandlerArgs } from '../../src/tui/input/key-handler'
import { initialState } from '../../src/tui/reducer'
import type { LiveCli } from '../../src/live-cli'
import type { TuiAction, TuiState } from '../../src/tui/types'

const key = (over: Partial<Key>): Key =>
  ({
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    ...over,
  }) as Key

function runningState(over?: Partial<TuiState>): TuiState {
  const base = initialState({ model: 'm', mode: 'prompt' })
  return { ...base, turn: { ...base.turn, state: 'running', startedAt: Date.now() }, ...over }
}

function press(state: TuiState, input: string, k: Partial<Key>, cli?: Partial<LiveCli>): TuiAction[] {
  const actions: TuiAction[] = []
  handleMainInput({
    input,
    key: key(k),
    state,
    dispatch: (a) => actions.push(a),
    cli: (cli ?? {}) as LiveCli,
    exit: () => {},
    chordEditor: () => false,
    submitTurn: async () => {},
    isMultilineModal: false,
    collapseMultilineModal: () => {},
  } as MainInputHandlerArgs)
  return actions
}

describe('type-ahead while a turn is running', () => {
  test('Enter enqueues the current buffer and clears it', () => {
    const state = runningState({ buffer: 'next thing', cursor: 10 })
    expect(press(state, '', { return: true })).toEqual([
      { type: 'queue/enqueue', text: 'next thing' },
      { type: 'buffer/set', buffer: '', cursor: 0 },
    ])
  })

  test('Enter on an empty buffer does nothing', () => {
    expect(press(runningState({ buffer: '   ' }), '', { return: true })).toEqual([])
  })

  test('printable keys edit the type-ahead buffer', () => {
    const state = runningState({ buffer: 'ab', cursor: 2 })
    expect(press(state, 'c', {})).toEqual([{ type: 'buffer/set', buffer: 'abc', cursor: 3 }])
  })

  test('a drag/paste burst with embedded CR collapses to a chip, never raw into the buffer', () => {
    const state = runningState({ buffer: '', cursor: 0 })
    const actions = press(state, "'/a.png'\r'/b.png'", {})
    expect(actions[0]?.type).toBe('paste/add')
    const set = actions[1]
    expect(set?.type).toBe('buffer/set')
    if (set?.type !== 'buffer/set') throw new Error('expected buffer/set')
    expect(set.buffer).toMatch(/^\[Pasted #[a-z0-9]+ — 2 lines]$/)
  })

  test('ctrl+c on an empty buffer still cancels the running turn', () => {
    let aborted = false
    const actions = press(runningState(), 'c', { ctrl: true }, { abort: () => (aborted = true) })
    expect(actions).toEqual([{ type: 'turn/cancelling' }])
    expect(aborted).toBe(true)
  })

  test('ctrl+c with a non-empty buffer clears it instead of cancelling the turn', () => {
    let aborted = false
    const state = runningState({ buffer: 'half typed', cursor: 10 })
    const actions = press(state, 'c', { ctrl: true }, { abort: () => (aborted = true) })
    expect(actions).toEqual([{ type: 'buffer/set', buffer: '', cursor: 0 }])
    expect(aborted).toBe(false)
  })

  test('escape always interrupts the turn even with a buffer', () => {
    let aborted = false
    const state = runningState({ buffer: 'half typed', cursor: 10 })
    const actions = press(state, '', { escape: true }, { abort: () => (aborted = true) })
    expect(actions).toEqual([{ type: 'turn/cancelling' }])
    expect(aborted).toBe(true)
  })

  test('Up recalls the newest queued message into the buffer to edit', () => {
    const state = runningState({ buffer: '', queued: ['first', 'second'] })
    expect(press(state, '', { upArrow: true })).toEqual([{ type: 'queue/recall-last' }])
  })

  test('Up does nothing when the buffer already has content (no clobber)', () => {
    const state = runningState({ buffer: 'typing', cursor: 6, queued: ['first'] })
    expect(press(state, '', { upArrow: true })).toEqual([])
  })

  test('Up does nothing when the queue is empty', () => {
    expect(press(runningState({ buffer: '', queued: [] }), '', { upArrow: true })).toEqual([])
  })
})
