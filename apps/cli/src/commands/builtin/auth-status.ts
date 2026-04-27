import { listCredentialProviders, getCredential, credentialsPath } from '@orchentra/cli-api'
import { THEME } from '../../tui/theme'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiKVRow } from '../ui-output'

const PROVIDERS = ['anthropic', 'gemini', 'openai', 'xai', 'dashscope', 'github', 'orchentra'] as const
type Provider = (typeof PROVIDERS)[number]

export class AuthStatusCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'auth',
    aliases: ['whoami'],
    summary: 'Show signed-in providers and how each credential resolves',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const signedIn = listCredentialProviders()
    const rows: UiKVRow[] = PROVIDERS.map((p) => describeProvider(p, signedIn.includes(p)))

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Authentication',
        subtitle: credentialsPath(),
        sections: [
          { rows },
          {
            title: 'Notes',
            rows: [
              { key: 'Env vars', value: 'override stored credentials' },
              { key: 'Sign in', value: '/login <provider>' },
            ],
          },
        ],
      })
      return true
    }

    const lines = [`Credential store: ${credentialsPath()}`, '']
    const w = Math.max(...rows.map((r) => r.key.length))
    for (const r of rows) lines.push(`  ${r.key.padEnd(w)}  ${r.value}`)
    lines.push('', 'Env vars override stored credentials. Sign in with /login <provider>.')
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}

function describeProvider(provider: Provider, hasStored: boolean): UiKVRow {
  const env = envStatus(provider)
  if (env) return { key: provider, value: env, valueColor: THEME.brand, bold: true }
  if (hasStored) {
    const stored = describeStored(provider)
    return { key: provider, value: stored, valueColor: THEME.accent }
  }
  return { key: provider, value: 'not signed in', valueColor: THEME.muted }
}

function envStatus(provider: Provider): string | null {
  const map: Record<Provider, readonly string[]> = {
    anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    xai: ['XAI_API_KEY'],
    dashscope: ['DASHSCOPE_API_KEY'],
    github: ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'],
    orchentra: ['ORCHENTRA_API_KEY'],
  }
  const vars = map[provider] ?? []
  for (const v of vars) {
    if (process.env[v] && process.env[v]!.trim().length > 0) {
      return `env:${v}`
    }
  }
  return null
}

function describeStored(provider: Provider): string {
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
