import { describe, expect, test } from 'bun:test'
import type { Key } from 'ink'
import { createChord } from '../../src/tui/hooks/use-chord'

// Tiny helpers to fabricate Key payloads. Ink's `Key` has many boolean fields;
// we spread `{...EMPTY_KEY, ...overrides}` to keep call sites compact.
const EMPTY_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
}

const ctrl = (letter: string): { input: string; key: Key } => ({
  input: letter,
  key: { ...EMPTY_KEY, ctrl: true },
})

describe('createChord', () => {
  test('fires onMatch when prefix then action arrive in order within timeout', () => {
    let fired = 0
    const chord = createChord({
      prefix: (input, key) => key.ctrl && input === 'x',
      action: (input, key) => key.ctrl && input === 'e',
      timeoutMs: 1500,
      onMatch: () => {
        fired += 1
      },
    })

    // Step 1: ctrl+x — consumed, no fire yet.
    const first = ctrl('x')
    expect(chord.handle(first.input, first.key)).toBe(true)
    expect(fired).toBe(0)

    // Step 2: ctrl+e — consumed, fires.
    const second = ctrl('e')
    expect(chord.handle(second.input, second.key)).toBe(true)
    expect(fired).toBe(1)
  })

  test('drops pending chord and passes through when next key does not match action', () => {
    let fired = 0
    const chord = createChord({
      prefix: (input, key) => key.ctrl && input === 'x',
      action: (input, key) => key.ctrl && input === 'e',
      timeoutMs: 1500,
      onMatch: () => {
        fired += 1
      },
    })

    const first = ctrl('x')
    expect(chord.handle(first.input, first.key)).toBe(true)

    // Press an unrelated key — chord drops, key is NOT consumed.
    const other = { input: 'a', key: { ...EMPTY_KEY } }
    expect(chord.handle(other.input, other.key)).toBe(false)
    expect(fired).toBe(0)

    // ctrl+e after the drop should NOT fire — pending state was cleared.
    const followup = ctrl('e')
    expect(chord.handle(followup.input, followup.key)).toBe(false)
    expect(fired).toBe(0)
  })

  test('drops pending chord when timeout elapses', async () => {
    let fired = 0
    const chord = createChord({
      prefix: (input, key) => key.ctrl && input === 'x',
      action: (input, key) => key.ctrl && input === 'e',
      timeoutMs: 20,
      onMatch: () => {
        fired += 1
      },
    })

    const first = ctrl('x')
    expect(chord.handle(first.input, first.key)).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 50))

    // After the timeout window, the action key must not fire — chord expired.
    const second = ctrl('e')
    expect(chord.handle(second.input, second.key)).toBe(false)
    expect(fired).toBe(0)
  })

  test('first key alone (no prefix match) passes through unconsumed', () => {
    let fired = 0
    const chord = createChord({
      prefix: (input, key) => key.ctrl && input === 'x',
      action: (input, key) => key.ctrl && input === 'e',
      timeoutMs: 1500,
      onMatch: () => {
        fired += 1
      },
    })

    const stray = { input: 'a', key: { ...EMPTY_KEY } }
    expect(chord.handle(stray.input, stray.key)).toBe(false)
    expect(fired).toBe(0)
  })
})
