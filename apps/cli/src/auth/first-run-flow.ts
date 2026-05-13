import { createInterface } from 'node:readline/promises'
import {
  saveCredential,
  saveCredentialAsync,
  tryLoadKeytar,
  type KeychainShim,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { renderBannerFrame } from '../render/banner'
import { runAnthropicLoginFlow } from '../ui/anthropic-login-flow'
import { CLI_NAME, CLI_VERSION } from '../version'

export const LLM_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'openai', 'xai', 'dashscope', 'gemini']

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
  gemini: 'Gemini (Google)',
}

// Match the THEME.brand hex (#156545) but expressed as a 24-bit ANSI escape
// so the raw-ANSI overlay we render here (before Ink mounts) stays on-brand
// with the rest of the CLI.
const C = {
  brand: '\x1b[38;2;21;101;69m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

export type AuthMethod = 'oauth' | 'api-key'

export type FirstRunResult = { readonly kind: 'saved'; readonly provider: ProviderKey } | { readonly kind: 'cancelled' }

export interface FirstRunDeps {
  pickProvider(): Promise<ProviderKey | null>
  pickAuthMethod?(provider: ProviderKey): Promise<AuthMethod | null>
  runOAuth?(provider: ProviderKey): Promise<{ ok: boolean; message?: string }>
  promptApiKey(provider: ProviderKey): Promise<string | null>
  save(provider: ProviderKey, apiKey: string): Promise<void>
  out?(msg: string): void
}

export async function runFirstRunFlow(deps: FirstRunDeps): Promise<FirstRunResult> {
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

export function makeDefaultFirstRunDeps(home?: string, shim?: KeychainShim | null): FirstRunDeps {
  return {
    pickProvider: async () => brandedPickProvider(),
    pickAuthMethod: async (provider) => brandedPickAuthMethod(provider),
    runOAuth: async (provider) => brandedRunOAuth(provider),
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

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H')
}

async function renderHeader(subtitle: string): Promise<void> {
  // Render the same welcome banner Orchentra shows post-sign-in so the
  // first-run screen feels like a continuation of the CLI rather than a
  // detached readline session. Model/provider are placeholders until the
  // user picks; they get re-rendered with real values when the TUI mounts.
  const frame = await renderBannerFrame({
    cliName: CLI_NAME,
    cliVersion: CLI_VERSION,
    model: 'claude-sonnet-4-20250514',
    permissionMode: 'workspace-write',
    cwd: process.cwd(),
    providerName: '—',
    username: process.env.USER,
  })
  process.stdout.write(frame)
  process.stdout.write('\n')
  process.stdout.write(`  ${C.bold}${C.brand}Sign in to start${C.reset}\n`)
  process.stdout.write(`  ${C.dim}${subtitle}${C.reset}\n\n`)
}

async function brandedPickProvider(): Promise<ProviderKey | null> {
  clearScreen()
  await renderHeader('Pick an LLM provider. Arrow keys + Enter, Esc to cancel.')
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

async function brandedPickAuthMethod(provider: ProviderKey): Promise<AuthMethod | null> {
  // Only Anthropic ships a working OAuth flow today (Claude Pro/Max
  // subscription). Every other provider goes straight to the API-key
  // prompt so we don't surface a dead choice.
  if (provider !== 'anthropic') return 'api-key'

  clearScreen()
  await renderHeader('Choose how you sign in to Anthropic.')
  const result = await promptSelect<AuthMethod>({
    title: `  ${C.dim}Sign-in method${C.reset}`,
    options: [
      { value: 'oauth', label: 'Claude Pro / Max subscription (OAuth)', hint: 'browser sign-in' },
      { value: 'api-key', label: 'API key (sk-ant-…)', hint: 'console.anthropic.com' },
    ],
  })
  if (result.type === 'cancelled') return null
  return result.value
}

async function brandedRunOAuth(provider: ProviderKey): Promise<{ ok: boolean; message?: string }> {
  if (provider !== 'anthropic') {
    return { ok: false, message: `OAuth is not wired up for ${provider} yet — use an API key.` }
  }
  clearScreen()
  const result = await runAnthropicLoginFlow()
  return { ok: result.ok, message: result.message }
}

async function brandedPromptApiKey(provider: ProviderKey): Promise<string | null> {
  clearScreen()
  await renderHeader('Paste your API key. Stored in your OS keychain.')
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
