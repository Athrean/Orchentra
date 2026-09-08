import { createInterface } from 'node:readline/promises'
import {
  getCredential,
  saveCredential,
  saveCredentialAsync,
  tryLoadKeytar,
  type KeychainShim,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { renderBannerFrame } from '../render/banner'
import { CLI_NAME, CLI_VERSION } from '../version'
import { DEFAULT_MODEL_ID } from '../model-catalog'

/**
 * Every provider first run can set up, in the order it offers them. This used
 * to be five API-key providers, which left the two that are pure
 * subscriptions unreachable from the flow that exists to make the CLI usable:
 * Antigravity has no key at all, and opencode Go's key is what the `go/`
 * models bill against — without it every Go model answers
 * `401 {"type":"AuthError","message":"Missing API key."}`.
 */
export const LLM_PROVIDERS: readonly ProviderKey[] = [
  'anthropic',
  'openai',
  'antigravity',
  'gemini',
  'zen',
  'xai',
  'dashscope',
]

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Claude — Pro/Max subscription or API key',
  openai: 'ChatGPT — Plus/Pro subscription or API key',
  antigravity: 'Google Antigravity — AI Pro/Ultra subscription',
  gemini: 'Gemini — Google account or API key',
  zen: 'opencode Go / Zen — paste plan key',
  xai: 'xAI (Grok) — API key',
  dashscope: 'DashScope (Qwen) — API key',
}

/** How much of the provider list to walk on first run. */
export type SetupMode = 'all' | 'one' | 'skip'

// Match the THEME.brand hex (#10A37F) but expressed as a 24-bit ANSI escape
// so the raw-ANSI overlay we render here (before Ink mounts) stays on-brand
// with the rest of the CLI.
const C = {
  brand: '\x1b[38;2;16;163;127m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

export type AuthMethod = 'oauth' | 'api-key'

export type FirstRunResult = { readonly kind: 'saved'; readonly provider: ProviderKey } | { readonly kind: 'cancelled' }

export interface FirstRunDeps {
  onStart?(): Promise<void>
  /**
   * Set every provider up now, pick one, or skip. Omit to keep the
   * single-provider flow (what the non-interactive and test paths want).
   */
  pickMode?(): Promise<SetupMode | null>
  /** Sign one provider in end to end, browser flow or key, as that provider requires. */
  signIn?(provider: ProviderKey): Promise<boolean>
  /** Providers `pickMode: 'all'` walks. Defaults to {@link LLM_PROVIDERS}. */
  providers?: readonly ProviderKey[]
  /** Already-configured providers, skipped by the walk. */
  configured?(provider: ProviderKey): boolean
  pickProvider(): Promise<ProviderKey | null>
  pickAuthMethod?(provider: ProviderKey): Promise<AuthMethod | null>
  runOAuth?(provider: ProviderKey): Promise<{ ok: boolean; message?: string }>
  promptApiKey(provider: ProviderKey): Promise<string | null>
  save(provider: ProviderKey, apiKey: string): Promise<void>
  out?(msg: string): void
}

export async function runFirstRunFlow(deps: FirstRunDeps): Promise<FirstRunResult> {
  await deps.onStart?.()

  if (deps.pickMode && deps.signIn) {
    const mode = await deps.pickMode()
    if (mode === null || mode === 'skip') return { kind: 'cancelled' }
    if (mode === 'all') return await setUpEveryProvider(deps)
  }

  if (deps.signIn) {
    const chosen = await deps.pickProvider()
    if (!chosen) return { kind: 'cancelled' }
    return (await deps.signIn(chosen)) ? { kind: 'saved', provider: chosen } : { kind: 'cancelled' }
  }

  const provider = await deps.pickProvider()
  if (!provider) return { kind: 'cancelled' }

  const method: AuthMethod | null = deps.pickAuthMethod ? await deps.pickAuthMethod(provider) : 'api-key'
  if (method === null) return { kind: 'cancelled' }

  if (method === 'oauth') {
    if (!deps.runOAuth) return { kind: 'cancelled' }
    const r = await deps.runOAuth(provider)
    if (!r.ok) {
      if (r.message) deps.out?.(r.message)
      return { kind: 'cancelled' }
    }
    deps.out?.(`Signed in to ${provider}.`)
    return { kind: 'saved', provider }
  }

  const rawKey = await deps.promptApiKey(provider)
  if (rawKey === null) return { kind: 'cancelled' }
  const apiKey = rawKey.trim()
  if (apiKey.length === 0) return { kind: 'cancelled' }

  await deps.save(provider, apiKey)
  deps.out?.(`Saved ${provider} key.`)
  return { kind: 'saved', provider }
}

/**
 * Walk the whole provider list. One refusal is not the end of the walk — a
 * user setting up four accounts will abandon some of them, and the run still
 * counts as successful if anything got configured.
 */
async function setUpEveryProvider(deps: FirstRunDeps): Promise<FirstRunResult> {
  const providers = deps.providers ?? LLM_PROVIDERS
  let last: ProviderKey | null = null
  for (const provider of providers) {
    if (deps.configured?.(provider)) {
      deps.out?.(`${provider} already signed in — skipping.`)
      last = last ?? provider
      continue
    }
    if (await deps.signIn!(provider)) last = provider
  }
  return last ? { kind: 'saved', provider: last } : { kind: 'cancelled' }
}

export function makeDefaultFirstRunDeps(home?: string, shim?: KeychainShim | null): FirstRunDeps {
  return {
    onStart: async () => renderFirstRunBanner(),
    pickMode: async () => brandedPickMode(),
    providers: LLM_PROVIDERS,
    configured: (provider) => getCredential(provider, home) !== null,
    // Delegates to the same `runLogin` the `orchentra login` verb uses, so
    // first run offers each provider whatever it actually supports — the
    // browser flow for Claude/ChatGPT/Antigravity/Gemini, a pasted key for
    // opencode and the rest — instead of demanding an API key for everything.
    signIn: async (provider) => {
      process.stdout.write(`\n  ${C.dim}────${C.reset} ${C.bold}${PROVIDER_LABELS[provider] ?? provider}${C.reset}\n`)
      const { runLogin, createTerminalLoginIo } = await import('../commands/run-auth')
      try {
        return await runLogin(provider, createTerminalLoginIo())
      } catch {
        return false
      }
    },
    pickProvider: async () => brandedPickProvider(),
    promptApiKey: async (provider) => brandedPromptApiKey(provider),
    save: async (provider, apiKey) => {
      // Dual-write during the transition period: the plaintext file is the
      // read path for the sync provider clients today, and the keychain is
      // the secure copy that async readers prefer. Both calls are
      // independently best-effort so a keychain failure does not drop the
      // file write.
      saveCredential(provider, { apiKey }, home)
      const resolvedShim = shim === undefined ? await tryLoadKeytar() : shim
      if (resolvedShim) {
        try {
          await saveCredentialAsync(provider, { apiKey }, home, resolvedShim)
        } catch {
          // keychain write is opportunistic — file copy already persisted
        }
      }
    },
    out: (msg) => process.stdout.write(`  ${C.brand}✓${C.reset} ${msg}\n`),
  }
}

// Render the full Orchentra welcome card exactly once at the top of the
// first-run flow. Subsequent pickers and prompts stack below it without
// clearing the screen, so the banner stays anchored and the user never
// sees flicker between steps.
async function renderFirstRunBanner(): Promise<void> {
  process.stdout.write('\x1b[2J\x1b[H')
  const frame = await renderBannerFrame({
    cliName: CLI_NAME,
    cliVersion: CLI_VERSION,
    model: DEFAULT_MODEL_ID,
    permissionMode: 'workspace-write',
    cwd: process.cwd(),
    providerName: '—',
    username: process.env.USER,
    forceBordered: true,
  })
  process.stdout.write(frame)
  process.stdout.write('\n')
  process.stdout.write(`  ${C.bold}${C.brand}Sign in to start${C.reset}\n`)
  process.stdout.write(`  ${C.dim}Arrow keys + Enter, Esc to cancel.${C.reset}\n\n`)
}

async function brandedPickMode(): Promise<SetupMode | null> {
  const result = await promptSelect<SetupMode>({
    title: `  ${C.dim}Set up providers${C.reset}`,
    options: [
      { value: 'all', label: 'Sign in to everything now — walk me through each provider' },
      { value: 'one', label: 'Just one for now — pick a provider' },
      { value: 'skip', label: 'Skip — I will run /login myself' },
    ],
  })
  if (result.type === 'cancelled') return null
  return result.value
}

async function brandedPickProvider(): Promise<ProviderKey | null> {
  const result = await promptSelect<ProviderKey>({
    title: `  ${C.dim}Provider${C.reset}`,
    options: LLM_PROVIDERS.map((p) => ({
      value: p,
      label: PROVIDER_LABELS[p] ?? p,
    })),
  })
  if (result.type === 'cancelled') return null
  return result.value
}

async function brandedPromptApiKey(provider: ProviderKey): Promise<string | null> {
  const label = PROVIDER_LABELS[provider] ?? provider
  process.stdout.write(`  ${C.dim}Provider:${C.reset} ${C.bold}${label}${C.reset}\n\n`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(`  ${C.brand}❯${C.reset} API key: `)
  } catch {
    return null
  } finally {
    rl.close()
  }
}
