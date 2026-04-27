import { getCredential, type ProviderKey } from '@orchentra/cli-api'

const ENV_VAR_MAP: Record<string, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  dashscope: ['DASHSCOPE_API_KEY'],
  github: ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'],
}

export function authStateHint(provider: ProviderKey): string {
  const envVar = envOverride(provider)
  if (envVar) return `env:${envVar}`
  return describeStored(provider) ?? 'not signed in'
}

function envOverride(provider: string): string | null {
  for (const v of ENV_VAR_MAP[provider] ?? []) {
    const val = process.env[v]
    if (val && val.trim().length > 0) return v
  }
  return null
}

function describeStored(provider: ProviderKey): string | null {
  const c = getCredential(provider)
  if (!c) return null
  const bits: string[] = []
  if (c.accessToken) bits.push('oauth')
  if (c.apiKey) bits.push('api-key')
  if (c.accountEmail) bits.push(c.accountEmail)
  if (c.expiresAt) {
    const secs = Math.round((c.expiresAt - Date.now()) / 1000)
    bits.push(secs > 0 ? `expires ${formatSecs(secs)}` : 'expired (refresh on use)')
  }
  return `stored (${bits.join(', ')})`
}

function formatSecs(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}
