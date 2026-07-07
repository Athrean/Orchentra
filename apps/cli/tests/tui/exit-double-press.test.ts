import { describe, expect, test } from 'bun:test'
import type { Key } from 'ink'
import { handleMainInput, type MainInputHandlerArgs } from '../../src/tui/input/key-handler'
import { buildKeybindings } from '../../src/tui/keybindings/registry'
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

const state = (over?: Partial<TuiState>): TuiState => ({ ...initialState({ model: 'm', mode: 'prompt' }), ...over })

function press(s: TuiState, input: string, k: Partial<Key>): { actions: TuiAction[]; exited: boolean } {
  const actions: TuiAction[] = []
  let exited = false
  handleMainInput({
    input,
    key: key(k),
    state: s,
    dispatch: (a) => actions.push(a),
    cli: {} as LiveCli,
    exit: () => {
      exited = true
    },
    chordEditor: () => false,
    submitTurn: async () => {},
    isMultilineModal: false,
    collapseMultilineModal: () => {},
    keybindings: buildKeybindings(),
  } as MainInputHandlerArgs)
  return { actions, exited }
}

const ARMED = Date.now() + 100_000 // far-future window so a second press always fires

describe('exit double-press gate', () => {
  test('ctrl+d on an empty buffer arms the hint on the first press, does not exit', () => {
    const { actions, exited } = press(state({ buffer: '' }), 'd', { ctrl: true })
    expect(exited).toBe(false)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ type: 'exit-hint/show', key: 'ctrl+d' })
  })

  test('ctrl+d again within the window exits', () => {
    const { exited } = press(state({ buffer: '', exitHintUntil: ARMED, exitHintKey: 'ctrl+d' }), 'd', { ctrl: true })
    expect(exited).toBe(true)
  })

  test('ctrl+d with text still forward-deletes instead of exiting', () => {
    const { actions, exited } = press(state({ buffer: 'abc', cursor: 0 }), 'd', { ctrl: true })
    expect(exited).toBe(false)
    expect(actions).toEqual([{ type: 'buffer/set', buffer: 'bc', cursor: 0 }])
  })

  test('ctrl+c on an empty buffer arms with its own key', () => {
    const { actions, exited } = press(state({ buffer: '' }), 'c', { ctrl: true })
    expect(exited).toBe(false)
    expect(actions[0]).toMatchObject({ type: 'exit-hint/show', key: 'ctrl+c' })
  })

  test('ctrl+c again within the window exits', () => {
    const { exited } = press(state({ buffer: '', exitHintUntil: ARMED, exitHintKey: 'ctrl+c' }), 'c', { ctrl: true })
    expect(exited).toBe(true)
  })

  test('the window is per-key: ctrl+c armed then ctrl+d re-arms instead of exiting', () => {
    const { actions, exited } = press(state({ buffer: '', exitHintUntil: ARMED, exitHintKey: 'ctrl+c' }), 'd', {
      ctrl: true,
    })
    expect(exited).toBe(false)
    expect(actions[0]).toMatchObject({ type: 'exit-hint/show', key: 'ctrl+d' })
  })
})
