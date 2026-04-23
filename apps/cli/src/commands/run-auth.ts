import { spawn } from 'node:child_process'
import {
  loginAnthropic,
  loginGemini,
  loginWithDeviceFlow,
  saveCredential,
  clearCredential,
  listCredentialProviders,
  getCredential,
  credentialsPath,
  type ProviderKey,
} from '@orchentra/cli-api'

const SUPPORTED: readonly ProviderKey[] = [
  'anthropic',
  'gemini',
  'openai',
  'xai',
  'dashscope',
  'github',
]

const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

export async function runLogin(provider: string, apiKey?: string): Promise<number> {
  const lower = provider.toLowerCase() as ProviderKey
  if (!SUPPORTED.includes(lower)) {
    process.stderr.write(`unknown provider: ${provider}\n`)
    process.stderr.write(`supported: ${SUPPORTED.join(', ')}\n`)
    return 1
  }

  if (apiKey) {
    const path = saveCredential(lower, { apiKey })
    process.stdout.write(`✓ saved ${lower} API key → ${path}\n`)
    return 0
  }

  try {
    if (lower === 'anthropic') {
      process.stdout.write('Signing in to Claude (Pro/Max subscription)…\n')
      const r = await loginAnthropic({
        onAuthUrl: async (url) => {
          process.stdout.write(`\nOpen this URL to authorize:\n  ${url}\n`)
          await openInBrowser(url)
          process.stdout.write('\nWaiting for browser flow…\n')
        },
      })
      process.stdout.write(`✓ signed in to Claude${r.persistedPath ? `  (${r.persistedPath})` : ''}\n`)
      return 0
    }
    if (lower === 'gemini') {
      process.stdout.write('Signing in to Google (Gemini)…\n')
      const r = await loginGemini({
        onAuthUrl: async (url) => {
          process.stdout.write(`\nOpen this URL to authorize:\n  ${url}\n`)
          await openInBrowser(url)
          process.stdout.write('\nWaiting for browser flow…\n')
        },
      })
      const who = r.accountEmail ? ` as ${r.accountEmail}` : ''
      process.stdout.write(`✓ signed in to Gemini${who}${r.persistedPath ? `  (${r.persistedPath})` : ''}\n`)
      return 0
    }
    if (lower === 'github') {
      process.stdout.write('Signing in to GitHub (device flow)…\n')
      const r = await loginWithDeviceFlow({
        clientId: GITHUB_OAUTH_CLIENT_ID,
        onUserCode: ({ userCode, verificationUri }) => {
          process.stdout.write(
            `\nOpen: ${verificationUri}\nEnter code: ${userCode}\n\nWaiting for authorization…\n`,
          )
        },
      })
      process.stdout.write(`✓ signed in to GitHub${r.persistedPath ? `  (${r.persistedPath})` : ''}\n`)
      return 0
    }
    process.stderr.write(
      `${lower} does not support OAuth. Pass an API key:\n  orchentra login ${lower} --api-key <key>\n`,
    )
    return 1
  } catch (err) {
    process.stderr.write(`login failed: ${(err as Error).message}\n`)
    return 1
  }
}

export async function runLogout(provider: string): Promise<number> {
  const lower = provider.toLowerCase() as ProviderKey
  if (!SUPPORTED.includes(lower)) {
    process.stderr.write(`unknown provider: ${provider}\n`)
    return 1
  }
  const cleared = clearCredential(lower)
  if (cleared) process.stdout.write(`✓ cleared stored credentials for ${lower}\n`)
  else process.stdout.write(`no stored credentials for ${lower}\n`)
  return 0
}

export async function runAuthStatus(): Promise<number> {
  process.stdout.write(`Credential store: ${credentialsPath()}\n\n`)
  const signedIn = listCredentialProviders()
  const rows: Array<{ p: string; s: string }> = []
  for (const p of SUPPORTED) {
    rows.push({ p, s: describe(p, signedIn.includes(p)) })
  }
  const width = Math.max(...rows.map((r) => r.p.length))
  for (const r of rows) {
    process.stdout.write(`  ${r.p.padEnd(width)}  ${r.s}\n`)
  }
  process.stdout.write('\nEnv vars override stored credentials.\n')
  return 0
}

function describe(provider: ProviderKey, hasStored: boolean): string {
  const envMap: Record<ProviderKey, readonly string[]> = {
    anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    xai: ['XAI_API_KEY'],
    dashscope: ['DASHSCOPE_API_KEY'],
    github: ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'],
    aws: [],
    gcp: [],
    azure: [],
  }
  for (const v of envMap[provider] ?? []) {
    if (process.env[v] && process.env[v]!.trim()) return `env:${v}`
  }
  if (!hasStored) return 'not signed in'
  const c = getCredential(provider)
  if (!c) return 'not signed in'
  const bits: string[] = []
  if (c.accessToken) bits.push('oauth')
  if (c.apiKey) bits.push('api-key')
  if (c.accountEmail) bits.push(c.accountEmail)
  if (c.expiresAt) {
    const secs = Math.round((c.expiresAt - Date.now()) / 1000)
    bits.push(secs > 0 ? `expires ${formatSecs(secs)}` : 'expired (will refresh)')
  }
  return `stored (${bits.join(', ')})`
}

function formatSecs(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

async function openInBrowser(url: string): Promise<void> {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(cmd, platform === 'win32' ? ['', url] : [url], {
        stdio: 'ignore',
        detached: true,
        shell: platform === 'win32',
      })
      child.on('error', () => resolve())
      child.on('exit', () => resolve())
      child.unref()
      setTimeout(resolve, 500)
    })
  } catch {
    /* ignore */
  }
}
