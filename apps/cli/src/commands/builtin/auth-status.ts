import { listCredentialProviders, getCredential, credentialsPath } from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class AuthStatusCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'auth',
    aliases: ['whoami'],
    summary: 'Show signed-in providers and how each credential resolves',
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    const lines: string[] = []
    lines.push(`Credential store: ${credentialsPath()}`)
    lines.push('')

    const signedIn = listCredentialProviders()
    const rows: Array<{ provider: string; status: string }> = []

    for (const p of ['anthropic', 'gemini', 'openai', 'xai', 'dashscope', 'github'] as const) {
      const env = envStatus(p)
      const stored = signedIn.includes(p) ? describeStored(p) : null
      rows.push({
        provider: p,
        status: env ?? stored ?? 'not signed in',
      })
    }

    const width = Math.max(...rows.map((r) => r.provider.length))
    for (const r of rows) {
      lines.push(`  ${r.provider.padEnd(width)}  ${r.status}`)
    }
    lines.push('')
    lines.push('Env vars override stored credentials. Sign in with /login <provider>.')
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function envStatus(provider: string): string | null {
  const map: Record<string, readonly string[]> = {
    anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    xai: ['XAI_API_KEY'],
    dashscope: ['DASHSCOPE_API_KEY'],
    github: ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'],
  }
  const vars = map[provider] ?? []
  for (const v of vars) {
    if (process.env[v] && process.env[v]!.trim().length > 0) {
      return `env:${v}`
    }
  }
  return null
}

function describeStored(provider: 'anthropic' | 'gemini' | 'openai' | 'xai' | 'dashscope' | 'github'): string {
  const c = getCredential(provider)
  if (!c) return 'not signed in'
  const bits: string[] = []
  if (c.accessToken) bits.push('oauth')
  if (c.apiKey) bits.push('api-key')
  if (c.accountEmail) bits.push(c.accountEmail)
  if (c.expiresAt) {
    const secs = Math.round((c.expiresAt - Date.now()) / 1000)
    bits.push(secs > 0 ? `expires in ${formatSecs(secs)}` : 'expired (will refresh)')
  }
  return `stored (${bits.join(', ')})`
}

function formatSecs(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}
