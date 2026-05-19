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
  | { type: 'success'; message: string }
  | { type: 'fail'; error: string }

export const TOP_ROW_COUNT = 3

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
      if (state.cursor === 1) return { kind: 'done', ok: false, message: 'API key sign-in: coming soon' }
      if (state.cursor === 2) return { kind: 'done', ok: false, message: '3rd-party sign-in: coming soon' }
    }
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
