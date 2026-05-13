import { createInterface } from 'node:readline/promises'
import {
  saveCredential,
  saveCredentialAsync,
  tryLoadKeytar,
  type KeychainShim,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { renderMascot } from '../render/mascot'
import { detectColorMode } from '../render/ansi'

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
// with the rest of the CLI. Picker and key prompt both use the same
// branded card framing so the first-run experience visually belongs to
// Orchentra, not to a generic readline session.
const C = {
  brand: '\x1b[38;2;21;101;69m',
  brandBg: '\x1b[48;2;21;101;69m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  italic: '\x1b[3m',
  reset: '\x1b[0m',
}

export type FirstRunResult = { readonly kind: 'saved'; readonly provider: ProviderKey } | { readonly kind: 'cancelled' }

export interface FirstRunDeps {
  pickProvider(): Promise<ProviderKey | null>
  promptApiKey(provider: ProviderKey): Promise<string | null>
  save(provider: ProviderKey, apiKey: string): Promise<void>
  out?(msg: string): void
}

export async function runFirstRunFlow(deps: FirstRunDeps): Promise<FirstRunResult> {
  const provider = await deps.pickProvider()
  if (!provider) return { kind: 'cancelled' }

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

function renderHeader(subtitle: string): void {
  const mascot = renderMascot(detectColorMode())
  process.stdout.write('\n')
  for (const line of mascot) process.stdout.write(`  ${line}\n`)
  process.stdout.write('\n')
  process.stdout.write(`  ${C.bold}${C.brand}Welcome to Orchentra${C.reset}\n`)
  process.stdout.write(`  ${C.dim}${subtitle}${C.reset}\n`)
  process.stdout.write('\n')
}

async function brandedPickProvider(): Promise<ProviderKey | null> {
  clearScreen()
  renderHeader('Pick an LLM provider to sign in. Arrow keys + Enter, Esc to cancel.')
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
  clearScreen()
  renderHeader('Stored in your OS keychain. Paste, then press Enter.')
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
