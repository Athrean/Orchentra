import { createInterface } from 'node:readline/promises'
import { saveCredentialAsync, tryLoadKeytar, type KeychainShim, type ProviderKey } from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'

export const LLM_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'openai', 'xai', 'dashscope', 'gemini']

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
  gemini: 'Gemini (Google)',
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
  deps.out?.(`Saved ${provider} key to OS keychain.`)
  return { kind: 'saved', provider }
}

export function makeDefaultFirstRunDeps(home?: string, shim?: KeychainShim | null): FirstRunDeps {
  return {
    pickProvider: async () => defaultPickProvider(),
    promptApiKey: async (provider) => defaultPromptApiKey(provider),
    save: async (provider, apiKey) => {
      const resolvedShim = shim === undefined ? await tryLoadKeytar() : shim
      await saveCredentialAsync(provider, { apiKey }, home, resolvedShim)
    },
    out: (msg) => process.stdout.write(`  ${msg}\n`),
  }
}

async function defaultPickProvider(): Promise<ProviderKey | null> {
  process.stdout.write('\n  Welcome to Orchentra. Pick an LLM provider to sign in.\n\n')
  const result = await promptSelect<ProviderKey>({
    title: '  Choose a provider:',
    options: LLM_PROVIDERS.map((p) => ({ value: p, label: `  ${PROVIDER_LABELS[p] ?? p}` })),
  })
  if (result.type === 'cancelled') return null
  return result.value
}

async function defaultPromptApiKey(provider: ProviderKey): Promise<string | null> {
  const label = PROVIDER_LABELS[provider] ?? provider
  process.stdout.write(`\n  Paste your ${label} API key. It will be stored in your OS keychain.\n\n`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question('  API key: ')
  } catch {
    return null
  } finally {
    rl.close()
  }
}
