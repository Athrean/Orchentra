/**
 * Pure state machine driving the in-TUI /login overlay. Three gateways:
 *   top → oauth (Pro/Max)
 *   top → apiKeyPicker → apiKeyInput (API key)
 *   top → thirdPartyPicker (docs links)
 *
 * Lives outside Ink so the same transitions can power the shell-verb
 * picker in a follow-up. All side effects (browser open, keychain save)
 * happen in the surface layer, not here.
 */

export type TopTier = 'pro-max' | 'api-key' | 'third-party'

export type OauthProvider = 'anthropic'

export type ApiKeyProvider = 'anthropic-console' | 'openai' | 'openrouter' | 'gemini' | 'xai' | 'dashscope'

export type ThirdPartyProvider = 'bedrock' | 'foundry' | 'vertex' | 'azure'

export type LoginState =
  | { kind: 'top'; cursor: number }
  | { kind: 'apiKeyPicker'; cursor: number }
  | { kind: 'apiKeyInput'; provider: ApiKeyProvider; buffer: string; error: string | null }
  | { kind: 'thirdPartyPicker'; cursor: number }
  | { kind: 'oauth'; provider: OauthProvider }
  | { kind: 'done'; ok: boolean; message: string }
  | { kind: 'closed' }

export type LoginEvent =
  | { type: 'select' }
  | { type: 'cursor-up' }
  | { type: 'cursor-down' }
  | { type: 'back' }
  | { type: 'cancel' }
  | { type: 'set-buffer'; buffer: string }
  | { type: 'success'; message: string }
  | { type: 'fail'; error: string }

export const TOP_ROW_COUNT = 3

export interface ApiKeyProviderRow {
  readonly provider: ApiKeyProvider
  readonly label: string
  readonly hint: string
}

export const API_KEY_PROVIDERS: readonly ApiKeyProviderRow[] = [
  { provider: 'anthropic-console', label: 'Anthropic Console', hint: 'API-key billing · pay per token' },
  { provider: 'openai', label: 'OpenAI', hint: 'OPENAI_API_KEY (gpt-4o, o1, ...)' },
  { provider: 'openrouter', label: 'OpenRouter', hint: 'OPENROUTER_API_KEY · aggregator' },
  { provider: 'gemini', label: 'Gemini', hint: 'GEMINI_API_KEY (skips Google OAuth)' },
  { provider: 'xai', label: 'xAI (Grok)', hint: 'XAI_API_KEY' },
  { provider: 'dashscope', label: 'DashScope (Qwen)', hint: 'DASHSCOPE_API_KEY' },
]

/**
 * Maps the picker's `ApiKeyProvider` (which separates Anthropic OAuth from
 * Anthropic API-key billing for picker UX) to the credential-store enum
 * (`ProviderKey`) that the keychain layer actually uses.
 */
export function apiKeyProviderToCredentialKey(provider: ApiKeyProvider): string {
  if (provider === 'anthropic-console') return 'anthropic'
  return provider
}

export function initialLoginState(): LoginState {
  return { kind: 'top', cursor: 0 }
}

export function loginReducer(state: LoginState, event: LoginEvent): LoginState {
  if (event.type === 'cancel') {
    return { kind: 'closed' }
  }

  if (state.kind === 'top') {
    if (event.type === 'cursor-down') {
      return { kind: 'top', cursor: (state.cursor + 1) % TOP_ROW_COUNT }
    }
    if (event.type === 'cursor-up') {
      return { kind: 'top', cursor: (state.cursor + TOP_ROW_COUNT - 1) % TOP_ROW_COUNT }
    }
    if (event.type === 'back') {
      return { kind: 'closed' }
    }
    if (event.type === 'select') {
      if (state.cursor === 0) return { kind: 'oauth', provider: 'anthropic' }
      if (state.cursor === 1) return { kind: 'apiKeyPicker', cursor: 0 }
      if (state.cursor === 2) return { kind: 'done', ok: false, message: '3rd-party sign-in: coming soon' }
    }
    return state
  }

  if (state.kind === 'apiKeyPicker') {
    if (event.type === 'cursor-down') {
      return { kind: 'apiKeyPicker', cursor: (state.cursor + 1) % API_KEY_PROVIDERS.length }
    }
    if (event.type === 'cursor-up') {
      return {
        kind: 'apiKeyPicker',
        cursor: (state.cursor + API_KEY_PROVIDERS.length - 1) % API_KEY_PROVIDERS.length,
      }
    }
    if (event.type === 'back') return { kind: 'top', cursor: 1 }
    if (event.type === 'select') {
      const row = API_KEY_PROVIDERS[state.cursor]
      if (!row) return state
      return { kind: 'apiKeyInput', provider: row.provider, buffer: '', error: null }
    }
    return state
  }

  if (state.kind === 'apiKeyInput') {
    if (event.type === 'back') return { kind: 'apiKeyPicker', cursor: 0 }
    if (event.type === 'set-buffer') return { ...state, buffer: event.buffer, error: null }
    if (event.type === 'success') return { kind: 'done', ok: true, message: event.message }
    if (event.type === 'fail') return { ...state, error: event.error }
    return state
  }

  if (state.kind === 'oauth') {
    if (event.type === 'back') return { kind: 'top', cursor: 0 }
    if (event.type === 'success') return { kind: 'done', ok: true, message: event.message }
    if (event.type === 'fail') return { kind: 'done', ok: false, message: event.error }
    return state
  }

  return state
}
