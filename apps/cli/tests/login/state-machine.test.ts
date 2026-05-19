import { describe, expect, test } from 'bun:test'
import { initialLoginState, loginReducer } from '../../src/login/state-machine'

describe('login state machine', () => {
  test('initial state is top with cursor 0', () => {
    const s = initialLoginState()
    expect(s.kind).toBe('top')
    if (s.kind === 'top') {
      expect(s.cursor).toBe(0)
    }
  })

  test('top + select with cursor 0 opens anthropic oauth', () => {
    const s = loginReducer(initialLoginState(), { type: 'select' })
    expect(s.kind).toBe('oauth')
    if (s.kind === 'oauth') {
      expect(s.provider).toBe('anthropic')
    }
  })

  test('cursor-down on top advances cursor and wraps at end', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    expect(s.kind === 'top' && s.cursor).toBe(1)
    s = loginReducer(s, { type: 'cursor-down' })
    expect(s.kind === 'top' && s.cursor).toBe(2)
    s = loginReducer(s, { type: 'cursor-down' })
    expect(s.kind === 'top' && s.cursor).toBe(0)
  })

  test('cursor-up on top wraps to last row from 0', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-up' })
    expect(s.kind === 'top' && s.cursor).toBe(2)
    s = loginReducer(s, { type: 'cursor-up' })
    expect(s.kind === 'top' && s.cursor).toBe(1)
  })

  test('top + select with cursor 1 opens the api-key drilldown', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    expect(s.kind).toBe('apiKeyPicker')
    if (s.kind === 'apiKeyPicker') expect(s.cursor).toBe(0)
  })

  test('apiKeyPicker cursor-down wraps over all registry rows', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    expect(s.kind).toBe('apiKeyPicker')
    let lastCursor = -1
    for (let i = 0; i < 8; i += 1) {
      s = loginReducer(s, { type: 'cursor-down' })
      if (s.kind !== 'apiKeyPicker') throw new Error('exited apiKeyPicker')
      expect(s.cursor).not.toBe(lastCursor)
      lastCursor = s.cursor
    }
  })

  test('apiKeyPicker + back returns to top with cursor on api-key row', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'back' })
    expect(s.kind).toBe('top')
    if (s.kind === 'top') expect(s.cursor).toBe(1)
  })

  test('apiKeyPicker + select opens apiKeyInput for the cursor row', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'select' })
    expect(s.kind).toBe('apiKeyInput')
    if (s.kind === 'apiKeyInput') {
      expect(s.provider).toBe('anthropic-console')
      expect(s.buffer).toBe('')
      expect(s.error).toBe(null)
    }
  })

  test('apiKeyInput + set-buffer replaces buffer and clears error', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'fail', error: 'bad key' })
    expect(s.kind === 'apiKeyInput' && s.error).toBe('bad key')
    s = loginReducer(s, { type: 'set-buffer', buffer: 'sk-abc' })
    if (s.kind !== 'apiKeyInput') throw new Error('left apiKeyInput')
    expect(s.buffer).toBe('sk-abc')
    expect(s.error).toBe(null)
  })

  test('apiKeyInput + success transitions to done(ok=true)', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'success', message: 'saved openai key' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(true)
      expect(s.message).toBe('saved openai key')
    }
  })

  test('apiKeyInput + fail keeps user in input with error preserved', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'set-buffer', buffer: 'sk-abc' })
    s = loginReducer(s, { type: 'fail', error: 'keychain locked' })
    expect(s.kind).toBe('apiKeyInput')
    if (s.kind === 'apiKeyInput') {
      expect(s.error).toBe('keychain locked')
      expect(s.buffer).toBe('sk-abc')
    }
  })

  test('apiKeyInput + back returns to apiKeyPicker', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'select' })
    s = loginReducer(s, { type: 'back' })
    expect(s.kind).toBe('apiKeyPicker')
  })

  test('top + select with cursor 2 stubs third-party tier as coming-soon done', () => {
    let s: ReturnType<typeof initialLoginState> = initialLoginState()
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(false)
      expect(s.message.toLowerCase()).toContain('coming soon')
    }
  })

  test('cancel from top closes overlay', () => {
    const s = loginReducer(initialLoginState(), { type: 'cancel' })
    expect(s.kind).toBe('closed')
  })

  test('back from top closes overlay (same as cancel at root)', () => {
    const s = loginReducer(initialLoginState(), { type: 'back' })
    expect(s.kind).toBe('closed')
  })

  test('back from oauth returns to top with cursor on pro-max row', () => {
    const oauth = loginReducer(initialLoginState(), { type: 'select' })
    const s = loginReducer(oauth, { type: 'back' })
    expect(s.kind).toBe('top')
    if (s.kind === 'top') expect(s.cursor).toBe(0)
  })

  test('success from oauth lands in done with ok=true', () => {
    const oauth = loginReducer(initialLoginState(), { type: 'select' })
    const s = loginReducer(oauth, { type: 'success', message: 'Connected to Claude' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(true)
      expect(s.message).toBe('Connected to Claude')
    }
  })

  test('fail from oauth lands in done with ok=false', () => {
    const oauth = loginReducer(initialLoginState(), { type: 'select' })
    const s = loginReducer(oauth, { type: 'fail', error: 'nope' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(false)
      expect(s.message).toBe('nope')
    }
  })
})
