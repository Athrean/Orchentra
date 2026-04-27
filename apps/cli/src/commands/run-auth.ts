import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import {
  loginGemini,
  loginWithDeviceFlow,
  saveCredential,
  clearCredential,
  listCredentialProviders,
  getCredential,
  credentialsPath,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { authStateHint } from './auth-state'
import { runAnthropicLoginFlow } from '../ui/anthropic-login-flow'

const OAUTH_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'gemini', 'github']
const API_KEY_PROVIDERS: readonly ProviderKey[] = ['openai', 'xai', 'dashscope']
const SUPPORTED: readonly ProviderKey[] = [...OAUTH_PROVIDERS, ...API_KEY_PROVIDERS]

const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude Pro/Max)',
  gemini: 'Gemini (Google)',
  github: 'GitHub',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
}

export async function runLogin(provider?: string, apiKey?: string): Promise<number> {
  let lower: ProviderKey
  if (!provider) {
    const picked = await pickProvider()
    if (!picked) return 0
    lower = picked
  } else {
    lower = provider.toLowerCase() as ProviderKey
    if (!SUPPORTED.includes(lower)) {
      process.stderr.write(`unknown provider: ${provider}\n`)
      process.stderr.write(`supported: ${SUPPORTED.join(', ')}\n`)
      return 1
    }
  }

  if (apiKey) {
    const path = saveCredential(lower, { apiKey })
    process.stdout.write(`✓ saved ${lower} API key → ${path}\n`)
    return 0
  }

  try {
    if (lower === 'anthropic') return await signInAnthropic()
    if (lower === 'gemini') return await signInGemini()
    if (lower === 'github') return await signInGithub()
    if (API_KEY_PROVIDERS.includes(lower)) return await signInWithApiKey(lower)
    process.stderr.write(`no login flow for ${lower}\n`)
    return 1
  } catch (err) {
    process.stderr.write(`login failed: ${(err as Error).message}\n`)
    return 1
  }
}

async function pickProvider(): Promise<ProviderKey | null> {
  const result = await promptSelect<ProviderKey>({
    title: 'Choose a provider to sign in:',
    options: SUPPORTED.map((p) => ({
      value: p,
      label: PROVIDER_LABELS[p] ?? p,
      hint: authStateHint(p),
    })),
  })
  if (result.type === 'cancelled') {
    process.stdout.write('cancelled\n')
    return null
  }
  return result.value
}

async function signInAnthropic(): Promise<number> {
  const r = await runAnthropicLoginFlow()
  if (!r.ok) {
    process.stderr.write(`  \x1b[31m${r.message}\x1b[0m\n`)
    return 1
  }
  return 0
}

async function signInGemini(): Promise<number> {
  printHeader('Sign in with Google', 'Use your Google account for Gemini.')
  const r = await loginGemini({
    onAuthUrl: async (url) => {
      await openInBrowser(url)
      process.stdout.write('\n  A browser tab has opened. Approve access to continue.\n')
      process.stdout.write(`  If the browser didn't open, visit:\n  \x1b[2m${url}\x1b[0m\n\n`)
      process.stdout.write('  Waiting for browser…\n')
    },
  })
  const who = r.accountEmail ? `  \x1b[2m(${r.accountEmail})\x1b[0m` : ''
  process.stdout.write(`\n\x1b[32m✓ Connected to Gemini\x1b[0m${who}\n`)
  return 0
}

async function signInGithub(): Promise<number> {
  printHeader('Sign in to GitHub', 'Device-flow sign-in for PRs, issues, and Actions.')
  const r = await loginWithDeviceFlow({
    clientId: GITHUB_OAUTH_CLIENT_ID,
    onUserCode: ({ userCode, verificationUri }) => {
      process.stdout.write(`\n  1. Open \x1b[36m${verificationUri}\x1b[0m\n`)
      process.stdout.write(`  2. Enter code: \x1b[1m${userCode}\x1b[0m\n\n`)
      process.stdout.write('  Waiting for authorization…\n')
    },
  })
  process.stdout.write(
    `\n\x1b[32m✓ Connected to GitHub\x1b[0m${r.persistedPath ? `  \x1b[2m(${r.persistedPath})\x1b[0m` : ''}\n`,
  )
  return 0
}

async function signInWithApiKey(provider: ProviderKey): Promise<number> {
  const label = PROVIDER_LABELS[provider] ?? provider
  const envVars: Partial<Record<ProviderKey, string>> = {
    openai: 'OPENAI_API_KEY',
    xai: 'XAI_API_KEY',
    dashscope: 'DASHSCOPE_API_KEY',
  }
  const envVar = envVars[provider]
  const subtitle = envVar
    ? `API key is saved locally. Or set ${envVar} in your shell instead.`
    : 'API key is saved locally to ~/.config/orchentra/credentials.json.'
  printHeader(`Sign in to ${label}`, subtitle)
  process.stdout.write('\n')
  const key = (await readLineFromStdin('  API key: ')).trim()
  if (!key) {
    process.stdout.write('\n  cancelled\n')
    return 0
  }
  const path = saveCredential(provider, { apiKey: key })
  process.stdout.write(`\n\x1b[32m✓ Saved ${provider} API key\x1b[0m  \x1b[2m(${path})\x1b[0m\n`)
  return 0
}

function printHeader(title: string, subtitle: string): void {
  process.stdout.write('\n')
  process.stdout.write(`  \x1b[1m${title}\x1b[0m\n`)
  process.stdout.write(`  \x1b[2m${subtitle}\x1b[0m\n`)
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

async function readLineFromStdin(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(prompt)
  } finally {
    rl.close()
  }
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
