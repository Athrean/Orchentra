import { describe, expect, test } from 'bun:test'
import {
  API_KEY_PROVIDERS,
  apiKeyProviderToCredentialKey,
  initialLoginState,
  loginReducer,
  signedInProvider,
  SUBSCRIPTION_PROVIDERS,
  type LoginState,
} from '../../src/login/state-machine'
import { MODEL_CATALOG, SIGN_IN_DEFAULT_MODEL } from '../../src/model-catalog'

/**
 * Signing in has to leave the session on a model the new account can serve.
 * A provider row with no entry here is a sign-in that reports success and then
 * sends the next prompt to whatever provider was already selected.
 */
describe('sign-in default model', () => {
  const catalogIds = new Set(MODEL_CATALOG.map((m) => m.id))

  test('every subscription provider has a default model', () => {
    for (const row of SUBSCRIPTION_PROVIDERS) {
      expect(SIGN_IN_DEFAULT_MODEL[row.provider]).toBeTruthy()
    }
  })

  test('every api-key provider has a default model', () => {
    for (const row of API_KEY_PROVIDERS) {
      expect(SIGN_IN_DEFAULT_MODEL[row.provider]).toBeTruthy()
    }
  })

  test('every default model is one /model can also select', () => {
    for (const [provider, model] of Object.entries(SIGN_IN_DEFAULT_MODEL)) {
      expect(`${provider}:${catalogIds.has(model)}`).toBe(`${provider}:true`)
    }
  })

  test('an Antigravity sign-in lands on a Code Assist model id, not a public one', () => {
    // The public `gemini-*-preview` ids 404 on the Antigravity host and vice
    // versa, so this pairing is the whole reason the sign-in works.
    expect(SIGN_IN_DEFAULT_MODEL['antigravity']).not.toContain('preview')
    expect(SIGN_IN_DEFAULT_MODEL['gemini']).toContain('preview')
  })

  test('an opencode sign-in lands on the Go host, not the credit-billed one', () => {
    // The /login row is "opencode Go", and `/zen/v1` bills prepaid credits: a
    // Go subscriber sent there gets 401 CreditsError on a plan they pay for.
    expect(SIGN_IN_DEFAULT_MODEL['zen']!.startsWith('go/')).toBe(true)
  })

  test('credential keys stay in step with the model map', () => {
    for (const row of API_KEY_PROVIDERS) {
      expect(typeof apiKeyProviderToCredentialKey(row.provider)).toBe('string')
    }
  })

  // The bug this guards: `done` carries only ok/message, so the provider has
  // to be read before the reducer runs. Reading it after yields undefined and
  // the session silently stays on the previous provider.
  test('the signed-in provider is readable from the state a success leaves', () => {
    for (let row = 0; row < SUBSCRIPTION_PROVIDERS.length; row += 1) {
      let s: LoginState = loginReducer(initialLoginState(), { type: 'select' })
      for (let i = 0; i < row; i += 1) s = loginReducer(s, { type: 'cursor-down' })
      s = loginReducer(s, { type: 'select' })
      const provider = signedInProvider(s)
      expect(provider).toBe(SUBSCRIPTION_PROVIDERS[row]!.provider)
      expect(SIGN_IN_DEFAULT_MODEL[provider!]).toBeTruthy()
      // ...and it is gone one transition later, which is the whole point.
      expect(signedInProvider(loginReducer(s, { type: 'success', message: 'ok' }))).toBeUndefined()
    }
  })
})
