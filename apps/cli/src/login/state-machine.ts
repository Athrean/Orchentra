/**
 * Pure state machine driving the in-TUI /login overlay. Three gateways:
 *   top → subscriptionPicker → (provider login card)
 *   top → apiKeyPicker → apiKeyInput (API key)
 *   top → thirdPartyPicker (docs links)
 *
 * Subscription sign-in reuses each vendor's own published installed-app OAuth
 * client, so a Claude Pro/Max, ChatGPT Plus/Pro, or Google AI Pro/Ultra plan
 * drives Orchentra without a separate API key. `zen` is the odd one out: the
 * opencode Go plan issues a key rather than a browser flow, so it routes to
 * the API-key input like any other key.
 *
 * Lives outside Ink so the same transitions can power the shell-verb
 * picker in a follow-up. All side effects (browser open, keychain save)
 * happen in the surface layer, not here.
 */

export type TopTier = 'subscription' | 'api-key' | 'third-party'

export type ApiKeyProvider = 'anthropic-console' | 'openai' | 'openrouter' | 'gemini' | 'xai' | 'dashscope' | 'zen'

export type SubscriptionProvider = 'anthropic' | 'codex' | 'antigravity' | 'zen'

export type ThirdPartyProvider = 'bedrock' | 'foundry' | 'vertex' | 'azure'

export type LoginState =
  | { kind: 'top'; cursor: number }
  | { kind: 'subscriptionPicker'; cursor: number }
  | { kind: 'subscriptionLogin'; provider: SubscriptionProvider }
  | { kind: 'apiKeyPicker'; cursor: number }
  | { kind: 'apiKeyInput'; provider: ApiKeyProvider; buffer: string; error: string | null }
  | { kind: 'thirdPartyPicker'; cursor: number }
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

export interface TopTierRow {
  readonly tier: TopTier
  readonly label: string
  readonly hint: string
}

/**
 * The top tier, in render order. Rows live here rather than in the Ink card so
 * a `back` transition and the rendered list cannot drift apart — which is
 * exactly what three hardcoded cursors did when this tier grew a third row.
 */
export const TOP_ROWS: readonly TopTierRow[] = [
  { tier: 'subscription', label: 'Subscription', hint: 'Claude Pro/Max, ChatGPT, Antigravity, opencode Go' },
  { tier: 'api-key', label: 'API key', hint: 'Anthropic Console, OpenAI, OpenRouter, Gemini, xAI, DashScope' },
  { tier: 'third-party', label: '3rd-party platform', hint: 'Amazon Bedrock, Microsoft Foundry, Vertex AI, Azure' },
]
export const TOP_ROW_COUNT = TOP_ROWS.length

function topRow(tier: TopTier): number {
  return TOP_ROWS.findIndex((row) => row.tier === tier)
}

export interface ApiKeyProviderRow {
  readonly provider: ApiKeyProvider
  readonly label: string
  readonly hint: string
}

export interface SubscriptionProviderRow {
  readonly provider: SubscriptionProvider
  readonly label: string
  readonly hint: string
}

/**
 * `zen` sits here because opencode Go is a subscription in every sense the user
 * cares about — a flat monthly plan, not per-token billing — even though it is
 * redeemed with a key. Selecting it hands off to the API-key input.
 */
export const SUBSCRIPTION_PROVIDERS: readonly SubscriptionProviderRow[] = [
  { provider: 'anthropic', label: 'Claude', hint: 'Claude Pro or Max · sign in with Anthropic' },
  { provider: 'codex', label: 'ChatGPT', hint: 'ChatGPT Plus or Pro · sign in with OpenAI' },
  { provider: 'antigravity', label: 'Antigravity', hint: 'Google AI Pro or Ultra · sign in with Google' },
  { provider: 'zen', label: 'opencode Go', hint: 'opencode Zen · flat monthly plan, paste key' },
]

export const API_KEY_PROVIDERS: readonly ApiKeyProviderRow[] = [
  { provider: 'anthropic-console', label: 'Anthropic Console', hint: 'API-key billing · pay per token' },
  { provider: 'openai', label: 'OpenAI', hint: 'OPENAI_API_KEY (gpt-4o, o1, ...)' },
  { provider: 'openrouter', label: 'OpenRouter', hint: 'OPENROUTER_API_KEY · aggregator' },
  { provider: 'gemini', label: 'Gemini', hint: 'GEMINI_API_KEY (skips Google OAuth)' },
  { provider: 'xai', label: 'xAI (Grok)', hint: 'XAI_API_KEY' },
  { provider: 'dashscope', label: 'DashScope (Qwen)', hint: 'DASHSCOPE_API_KEY' },
  { provider: 'zen', label: 'opencode Zen', hint: 'ZEN_API_KEY · Go plan or pay-as-you-go' },
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

/** Credential-store key each subscription row writes to once its flow succeeds. */
export function subscriptionProviderToCredentialKey(provider: SubscriptionProvider): string {
  if (provider === 'codex') return 'openai'
  return provider
}

export interface ThirdPartyProviderRow {
  readonly provider: ThirdPartyProvider
  readonly label: string
  readonly docsUrl: string
}

export const THIRD_PARTY_PROVIDERS: readonly ThirdPartyProviderRow[] = [
  { provider: 'bedrock', label: 'AWS Bedrock', docsUrl: 'https://docs.aws.amazon.com/bedrock/' },
  {
    provider: 'foundry',
    label: 'Microsoft Foundry',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-foundry/',
  },
  { provider: 'vertex', label: 'Google Vertex AI', docsUrl: 'https://cloud.google.com/vertex-ai/docs' },
  {
    provider: 'azure',
    label: 'Azure OpenAI',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
  },
]

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
      if (state.cursor === 0) return { kind: 'subscriptionPicker', cursor: 0 }
      if (state.cursor === 1) return { kind: 'apiKeyPicker', cursor: 0 }
      if (state.cursor === 2) return { kind: 'thirdPartyPicker', cursor: 0 }
    }
    return state
  }

  if (state.kind === 'subscriptionPicker') {
    if (event.type === 'cursor-down') {
      return { kind: 'subscriptionPicker', cursor: (state.cursor + 1) % SUBSCRIPTION_PROVIDERS.length }
    }
    if (event.type === 'cursor-up') {
      return {
        kind: 'subscriptionPicker',
        cursor: (state.cursor + SUBSCRIPTION_PROVIDERS.length - 1) % SUBSCRIPTION_PROVIDERS.length,
      }
    }
    if (event.type === 'back') return { kind: 'top', cursor: topRow('subscription') }
    if (event.type === 'select') {
      const row = SUBSCRIPTION_PROVIDERS[state.cursor]
      if (!row) return state
      // opencode Go is a plan redeemed with a key, not a browser flow.
      if (row.provider === 'zen') {
        return { kind: 'apiKeyInput', provider: 'zen', buffer: '', error: null }
      }
      return { kind: 'subscriptionLogin', provider: row.provider }
    }
    return state
  }

  if (state.kind === 'subscriptionLogin') {
    if (event.type === 'back') return { kind: 'subscriptionPicker', cursor: 0 }
    if (event.type === 'success') return { kind: 'done', ok: true, message: event.message }
    if (event.type === 'fail') return { kind: 'done', ok: false, message: event.error }
    return state
  }

  if (state.kind === 'thirdPartyPicker') {
    if (event.type === 'cursor-down') {
      return { kind: 'thirdPartyPicker', cursor: (state.cursor + 1) % THIRD_PARTY_PROVIDERS.length }
    }
    if (event.type === 'cursor-up') {
      return {
        kind: 'thirdPartyPicker',
        cursor: (state.cursor + THIRD_PARTY_PROVIDERS.length - 1) % THIRD_PARTY_PROVIDERS.length,
      }
    }
    if (event.type === 'back') return { kind: 'top', cursor: topRow('third-party') }
    if (event.type === 'select') {
      const row = THIRD_PARTY_PROVIDERS[state.cursor]
      if (!row) return state
      return { kind: 'done', ok: true, message: `Opened docs for ${row.label}: ${row.docsUrl}` }
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
    if (event.type === 'back') return { kind: 'top', cursor: topRow('api-key') }
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

  return state
}
