import { describe, expect, test } from 'bun:test'
import type { Key } from 'ink'
import { handleMainInput, type MainInputHandlerArgs } from '../../src/tui/input/key-handler'
import { buildKeybindings } from '../../src/tui/keybindings/registry'
import { initialState } from '../../src/tui/reducer'
import type { LiveCli } from '../../src/live-cli'
import type { TuiAction } from '../../src/tui/types'

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

function press(input: string, k: Partial<Key>, over?: Partial<MainInputHandlerArgs>): TuiAction[] {
  const actions: TuiAction[] = []
  const state = { ...initialState({ model: 'm', mode: 'prompt' }), history: ['git push'], ...over?.state }
  handleMainInput({
    input,
    key: key(k),
    state,
    dispatch: (a) => actions.push(a),
    cli: {} as LiveCli,
    exit: () => {},
    chordEditor: () => false,
    submitTurn: async () => {},
    isMultilineModal: false,
    collapseMultilineModal: () => {},
    keybindings: buildKeybindings(),
    ...over,
  })
  return actions
}

describe('key-handler routes global chords through the registry', () => {
  test('default ctrl+l clears the transcript', () => {
    expect(press('l', { ctrl: true })).toEqual([{ type: 'transcript/clear' }])
  })

  test('default ctrl+f opens history search when history exists', () => {
    expect(press('f', { ctrl: true })).toEqual([{ type: 'history-search/open' }])
  })

  test('shift+tab cycles permission mode', () => {
    expect(press('', { shift: true, tab: true })).toEqual([{ type: 'mode/cycle' }])
  })

  test('a user rebind moves the action to the new combo and frees the old', () => {
    const kb = buildKeybindings({ 'history-search': 'ctrl+t' })
    expect(press('t', { ctrl: true }, { keybindings: kb })).toEqual([{ type: 'history-search/open' }])
    // ctrl+f no longer opens search — it falls through to a no-op (no dispatch).
    expect(press('f', { ctrl: true }, { keybindings: kb })).toEqual([])
  })
})
