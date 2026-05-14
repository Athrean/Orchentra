import { getCredentialAsync, type KeychainShim, KEYCHAIN_SERVICE, type ProviderKey } from '@orchentra/cli-api'

export const LLM_PROVIDER_ENV_VARS: Record<string, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  dashscope: ['DASHSCOPE_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
}

const LLM_PROVIDERS = Object.keys(LLM_PROVIDER_ENV_VARS) as ProviderKey[]

function envValueSet(name: string): boolean {
  const v = process.env[name]
  return !!v && v.trim().length > 0
}

function envCredentialFor(provider: ProviderKey): boolean {
  const names = LLM_PROVIDER_ENV_VARS[provider]
  if (!names) return false
  return names.some(envValueSet)
}

export async function hasAnyLlmCredential(home: string, shim: KeychainShim | null): Promise<boolean> {
  for (const provider of LLM_PROVIDERS) {
    if (envCredentialFor(provider)) return true
    const cred = await getCredentialAsync(provider, home, shim)
    if (cred && (cred.apiKey || cred.accessToken)) return true
  }
  return false
}

export async function listLlmProvidersWithCreds(home: string, shim: KeychainShim | null): Promise<ProviderKey[]> {
  const set = new Set<ProviderKey>()
  for (const provider of LLM_PROVIDERS) {
    if (envCredentialFor(provider)) {
      set.add(provider)
      continue
    }
    const cred = await getCredentialAsync(provider, home, shim)
    if (cred && (cred.apiKey || cred.accessToken)) set.add(provider)
  }
  return Array.from(set)
}

export { KEYCHAIN_SERVICE }
