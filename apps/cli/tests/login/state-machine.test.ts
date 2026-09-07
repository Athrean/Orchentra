import { describe, expect, test } from 'bun:test'
import {
  initialLoginState,
  loginReducer,
  subscriptionProviderToCredentialKey,
  SUBSCRIPTION_PROVIDERS,
  TOP_ROW_COUNT,
  type LoginState,
} from '../../src/login/state-machine'

/** Walk the top tier to `cursor` and select it. Row order: subscription, api-key, 3rd-party. */
function openTier(cursor: number): LoginState {
  let s: LoginState = initialLoginState()
  for (let i = 0; i < cursor; i += 1) s = loginReducer(s, { type: 'cursor-down' })
  return loginReducer(s, { type: 'select' })
}

const SUBSCRIPTION_ROW = 0
const API_KEY_ROW = 1
const THIRD_PARTY_ROW = 2

describe('login state machine', () => {
  test('initial state is top with cursor 0', () => {
    const s = initialLoginState()
    expect(s.kind).toBe('top')
    if (s.kind === 'top') {
      expect(s.cursor).toBe(0)
    }
  })

  test('top + select with cursor 0 opens the subscription drilldown', () => {
    const s = openTier(SUBSCRIPTION_ROW)
    expect(s.kind).toBe('subscriptionPicker')
    if (s.kind === 'subscriptionPicker') expect(s.cursor).toBe(0)
  })

  test('top + select with cursor 1 opens the api-key drilldown', () => {
    const s = openTier(API_KEY_ROW)
    expect(s.kind).toBe('apiKeyPicker')
    if (s.kind === 'apiKeyPicker') expect(s.cursor).toBe(0)
  })

  test('cursor-down on top advances cursor and wraps at end', () => {
    let s: LoginState = initialLoginState()
    for (let i = 1; i < TOP_ROW_COUNT; i += 1) {
      s = loginReducer(s, { type: 'cursor-down' })
      expect(s.kind === 'top' && s.cursor).toBe(i)
    }
    s = loginReducer(s, { type: 'cursor-down' })
    expect(s.kind === 'top' && s.cursor).toBe(0)
  })

  test('cursor-up on top wraps to last row from 0', () => {
    let s: LoginState = initialLoginState()
    s = loginReducer(s, { type: 'cursor-up' })
    expect(s.kind === 'top' && s.cursor).toBe(TOP_ROW_COUNT - 1)
    s = loginReducer(s, { type: 'cursor-down' })
    expect(s.kind === 'top' && s.cursor).toBe(0)
  })

  test('top + select with cursor 2 opens the third-party drilldown', () => {
    const s = openTier(THIRD_PARTY_ROW)
    expect(s.kind).toBe('thirdPartyPicker')
    if (s.kind === 'thirdPartyPicker') expect(s.cursor).toBe(0)
  })

  // ── Subscription tier ──────────────────────────────────────────────────────

  test('subscriptionPicker cursor-down wraps over every registry row', () => {
    let s = openTier(SUBSCRIPTION_ROW)
    const seen = new Set<number>()
    for (let i = 0; i < SUBSCRIPTION_PROVIDERS.length; i += 1) {
      s = loginReducer(s, { type: 'cursor-down' })
      if (s.kind !== 'subscriptionPicker') throw new Error('exited subscriptionPicker')
      seen.add(s.cursor)
    }
    expect(seen.size).toBe(SUBSCRIPTION_PROVIDERS.length)
    // A full lap returns to where it started.
    expect(s.kind === 'subscriptionPicker' && s.cursor).toBe(0)
  })

  test('subscriptionPicker + select mounts the login card for the cursor row', () => {
    const s = loginReducer(openTier(SUBSCRIPTION_ROW), { type: 'select' })
    expect(s.kind).toBe('subscriptionLogin')
    if (s.kind === 'subscriptionLogin') expect(s.provider).toBe('anthropic')
  })

  test('opencode Go routes to the api-key input, not a browser flow', () => {
    const zenRow = SUBSCRIPTION_PROVIDERS.findIndex((r) => r.provider === 'zen')
    expect(zenRow).toBeGreaterThanOrEqual(0)
    let s = openTier(SUBSCRIPTION_ROW)
    for (let i = 0; i < zenRow; i += 1) s = loginReducer(s, { type: 'cursor-down' })
    s = loginReducer(s, { type: 'select' })
    expect(s.kind).toBe('apiKeyInput')
    if (s.kind === 'apiKeyInput') expect(s.provider).toBe('zen')
  })

  test('subscriptionLogin + success/fail land on done with the card message', () => {
    const mounted = loginReducer(openTier(SUBSCRIPTION_ROW), { type: 'select' })
    const ok = loginReducer(mounted, { type: 'success', message: 'Connected to Claude' })
    expect(ok.kind).toBe('done')
    if (ok.kind === 'done') {
      expect(ok.ok).toBe(true)
      expect(ok.message).toBe('Connected to Claude')
    }
    const bad = loginReducer(mounted, { type: 'fail', error: 'port 1455 in use' })
    expect(bad.kind).toBe('done')
    if (bad.kind === 'done') {
      expect(bad.ok).toBe(false)
      expect(bad.message).toBe('port 1455 in use')
    }
  })

  test('subscriptionLogin + back returns to the subscription picker', () => {
    const mounted = loginReducer(openTier(SUBSCRIPTION_ROW), { type: 'select' })
    expect(loginReducer(mounted, { type: 'back' }).kind).toBe('subscriptionPicker')
  })

  test('subscriptionPicker + back returns to top with cursor on the subscription row', () => {
    const s = loginReducer(openTier(SUBSCRIPTION_ROW), { type: 'back' })
    expect(s.kind).toBe('top')
    if (s.kind === 'top') expect(s.cursor).toBe(SUBSCRIPTION_ROW)
  })

  test('codex writes to the openai credential; the rest map to their own key', () => {
    expect(subscriptionProviderToCredentialKey('codex')).toBe('openai')
    expect(subscriptionProviderToCredentialKey('anthropic')).toBe('anthropic')
    expect(subscriptionProviderToCredentialKey('antigravity')).toBe('antigravity')
    expect(subscriptionProviderToCredentialKey('zen')).toBe('zen')
  })

  // ── API-key tier ───────────────────────────────────────────────────────────

  test('apiKeyPicker cursor-down wraps over all registry rows', () => {
    let s = openTier(API_KEY_ROW)
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
    const s = loginReducer(openTier(API_KEY_ROW), { type: 'back' })
    expect(s.kind).toBe('top')
    if (s.kind === 'top') expect(s.cursor).toBe(API_KEY_ROW)
  })

  test('apiKeyPicker + select opens apiKeyInput for the cursor row', () => {
    const s = loginReducer(openTier(API_KEY_ROW), { type: 'select' })
    expect(s.kind).toBe('apiKeyInput')
    if (s.kind === 'apiKeyInput') {
      expect(s.provider).toBe('anthropic-console')
      expect(s.buffer).toBe('')
      expect(s.error).toBe(null)
    }
  })

  test('apiKeyInput + set-buffer replaces buffer and clears error', () => {
    let s = loginReducer(openTier(API_KEY_ROW), { type: 'select' })
    s = loginReducer(s, { type: 'fail', error: 'bad key' })
    expect(s.kind === 'apiKeyInput' && s.error).toBe('bad key')
    s = loginReducer(s, { type: 'set-buffer', buffer: 'sk-abc' })
    if (s.kind !== 'apiKeyInput') throw new Error('left apiKeyInput')
    expect(s.buffer).toBe('sk-abc')
    expect(s.error).toBe(null)
  })

  test('apiKeyInput + success transitions to done(ok=true)', () => {
    let s = loginReducer(openTier(API_KEY_ROW), { type: 'select' })
    s = loginReducer(s, { type: 'success', message: 'saved openai key' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(true)
      expect(s.message).toBe('saved openai key')
    }
  })

  test('apiKeyInput + fail keeps user in input with error preserved', () => {
    let s = loginReducer(openTier(API_KEY_ROW), { type: 'select' })
    s = loginReducer(s, { type: 'set-buffer', buffer: 'sk-abc' })
    s = loginReducer(s, { type: 'fail', error: 'keychain locked' })
    expect(s.kind).toBe('apiKeyInput')
    if (s.kind === 'apiKeyInput') {
      expect(s.error).toBe('keychain locked')
      expect(s.buffer).toBe('sk-abc')
    }
  })

  test('apiKeyInput + back returns to apiKeyPicker', () => {
    let s = loginReducer(openTier(API_KEY_ROW), { type: 'select' })
    s = loginReducer(s, { type: 'back' })
    expect(s.kind).toBe('apiKeyPicker')
  })

  // ── Third-party tier ───────────────────────────────────────────────────────

  test('thirdPartyPicker cursor-down wraps over registry', () => {
    let s = openTier(THIRD_PARTY_ROW)
    let lastCursor = -1
    for (let i = 0; i < 6; i += 1) {
      s = loginReducer(s, { type: 'cursor-down' })
      if (s.kind !== 'thirdPartyPicker') throw new Error('exited thirdPartyPicker')
      expect(s.cursor).not.toBe(lastCursor)
      lastCursor = s.cursor
    }
  })

  test('thirdPartyPicker + back returns to top with cursor on 3rd-party row', () => {
    const s = loginReducer(openTier(THIRD_PARTY_ROW), { type: 'back' })
    expect(s.kind).toBe('top')
    if (s.kind === 'top') expect(s.cursor).toBe(THIRD_PARTY_ROW)
  })

  test('thirdPartyPicker + select transitions to done with the docs URL in the message', () => {
    const s = loginReducer(openTier(THIRD_PARTY_ROW), { type: 'select' })
    expect(s.kind).toBe('done')
    if (s.kind === 'done') {
      expect(s.ok).toBe(true)
      expect(s.message.toLowerCase()).toContain('http')
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
})
