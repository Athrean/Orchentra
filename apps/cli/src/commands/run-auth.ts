import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import {
  clearCredential,
  credentialsPath,
  getCredential,
  listCredentialProviders,
  loginGemini,
  loginWithDeviceFlow,
  saveCredentialAsync,
  tryLoadKeytar,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { authStateHint } from './auth-state'

const OAUTH_PROVIDERS: readonly ProviderKey[] = ['gemini', 'github']
const API_KEY_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'openai', 'xai', 'dashscope']
export const LOGIN_PROVIDERS: readonly ProviderKey[] = [...OAUTH_PROVIDERS, ...API_KEY_PROVIDERS]

const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Gemini (Google)',
  github: 'GitHub',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
}

export interface LoginProviderOption {
  readonly value: ProviderKey
  readonly label: string
  readonly hint: string
}

export interface LoginIo {
  readonly apiKey?: string
  readonly canPrompt: boolean
  pickProvider(options: readonly LoginProviderOption[]): Promise<ProviderKey | null>
  promptApiKey(provider: ProviderKey): Promise<string | null>
  openBrowser(url: string): Promise<void>
  saveApiKey(provider: ProviderKey, apiKey: string): Promise<void>
  out(message: string): void
  error(message: string): void
}

export async function runLogin(provider: string | undefined, io: LoginIo): Promise<boolean> {
  let selected: ProviderKey
  if (!provider) {
    if (!io.canPrompt) {
      io.error('login: provider required')
      return false
    }
    const picked = await io.pickProvider(providerOptions())
    if (!picked) {
      io.out('cancelled')
      return true
    }
    selected = picked
  } else {
    selected = provider.toLowerCase() as ProviderKey
    if (!LOGIN_PROVIDERS.includes(selected)) {
      io.error(`unknown provider: ${provider}\nsupported: ${LOGIN_PROVIDERS.join(', ')}`)
      return false
    }
  }

  try {
    if (io.apiKey) {
      await io.saveApiKey(selected, io.apiKey)
      io.out(`✓ saved ${selected} API key`)
      return true
    }

    if (!io.canPrompt) {
      const keyHint = API_KEY_PROVIDERS.includes(selected) ? ' --api-key <key>' : ''
      io.out(`Run in a fresh terminal: orchentra login ${selected}${keyHint}`)
      return true
    }

    if (selected === 'gemini') return await signInGemini(io)
    if (selected === 'github') return await signInGitHub(io)
    return await signInWithApiKey(selected, io)
  } catch (error) {
    io.error(`login failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export function createTerminalLoginIo(apiKey?: string): LoginIo {
  return {
    ...(apiKey ? { apiKey } : {}),
    canPrompt: true,
    pickProvider: async (options) => {
      const result = await promptSelect<ProviderKey>({
        title: 'Choose a provider to sign in:',
        options: [...options],
      })
      return result.type === 'cancelled' ? null : result.value
    },
    promptApiKey: async (provider) => readLineFromStdin(`API key for ${PROVIDER_LABELS[provider] ?? provider}: `),
    openBrowser: openInBrowser,
    saveApiKey: saveLoginApiKey,
    out: (message) => process.stdout.write(withNewline(message)),
    error: (message) => process.stderr.write(withNewline(message)),
  }
}

export function createNonInteractiveLoginIo(options: {
  readonly apiKey?: string
  readonly out: (message: string) => void
  readonly error: (message: string) => void
}): LoginIo {
  return {
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    canPrompt: false,
    pickProvider: async () => null,
    promptApiKey: async () => null,
    openBrowser: async () => {},
    saveApiKey: saveLoginApiKey,
    out: options.out,
    error: options.error,
  }
}

export async function saveLoginApiKey(provider: ProviderKey, apiKey: string): Promise<void> {
  const shim = await tryLoadKeytar()
  await saveCredentialAsync(provider, { apiKey }, undefined, shim)
}

function providerOptions(): LoginProviderOption[] {
  return LOGIN_PROVIDERS.map((value) => ({
    value,
    label: PROVIDER_LABELS[value] ?? value,
    hint: authStateHint(value),
  }))
}

async function signInGemini(io: LoginIo): Promise<boolean> {
  io.out('Sign in with Google — use your Google account for Gemini.')
  const result = await loginGemini({
    onAuthUrl: async (url) => {
      await io.openBrowser(url)
      io.out(`Approve access in your browser. If it did not open, visit:\n${url}\nWaiting for browser…`)
    },
  })
  const account = result.accountEmail ? ` (${result.accountEmail})` : ''
  io.out(`✓ Connected to Gemini${account}`)
  return true
}

async function signInGitHub(io: LoginIo): Promise<boolean> {
  io.out('Sign in to GitHub — device flow for PRs, issues, and Actions.')
  const result = await loginWithDeviceFlow({
    clientId: GITHUB_OAUTH_CLIENT_ID,
    onUserCode: ({ userCode, verificationUri }) => {
      io.out(`Open ${verificationUri}\nEnter code: ${userCode}\nWaiting for authorization…`)
    },
  })
  const path = result.persistedPath ? ` (${result.persistedPath})` : ''
  io.out(`✓ Connected to GitHub${path}`)
  return true
}

async function signInWithApiKey(provider: ProviderKey, io: LoginIo): Promise<boolean> {
  const key = (await io.promptApiKey(provider))?.trim() ?? ''
  if (!key) {
    io.out('cancelled')
    return true
  }
  await io.saveApiKey(provider, key)
  io.out(`✓ Saved ${provider} API key`)
  return true
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
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  await new Promise<void>((resolve) => {
    try {
      const child = spawn(command, platform === 'win32' ? ['', url] : [url], {
        stdio: 'ignore',
        detached: true,
        shell: platform === 'win32',
      })
      child.on('error', () => resolve())
      child.on('exit', () => resolve())
      child.unref()
      setTimeout(resolve, 500)
    } catch {
      resolve()
    }
  })
}

function withNewline(message: string): string {
  return message.endsWith('\n') ? message : `${message}\n`
}

export async function runLogout(provider: string): Promise<number> {
  const selected = provider.toLowerCase() as ProviderKey
  if (!LOGIN_PROVIDERS.includes(selected)) {
    process.stderr.write(`unknown provider: ${provider}\n`)
    return 1
  }
  const cleared = clearCredential(selected)
  process.stdout.write(
    cleared ? `✓ cleared stored credentials for ${selected}\n` : `no stored credentials for ${selected}\n`,
  )
  return 0
}

export async function runAuthStatus(): Promise<number> {
  process.stdout.write(`Credential store: ${credentialsPath()}\n\n`)
  const signedIn = listCredentialProviders()
  const rows = LOGIN_PROVIDERS.map((provider) => ({
    provider,
    status: describe(provider, signedIn.includes(provider)),
  }))
  const width = Math.max(...rows.map((row) => row.provider.length))
  for (const row of rows) process.stdout.write(`  ${row.provider.padEnd(width)}  ${row.status}\n`)
  process.stdout.write('\nEnv vars override stored credentials.\n')
  return 0
}

function describe(provider: ProviderKey, hasStored: boolean): string {
  const envMap: Partial<Record<ProviderKey, readonly string[]>> = {
    anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
    gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_OAUTH_TOKEN'],
    openai: ['OPENAI_API_KEY'],
    xai: ['XAI_API_KEY'],
    dashscope: ['DASHSCOPE_API_KEY'],
    github: ['ORCHENTRA_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'],
  }
  for (const variable of envMap[provider] ?? []) {
    if (process.env[variable]?.trim()) return `env:${variable}`
  }
  if (!hasStored) return 'not signed in'
  const credential = getCredential(provider)
  if (!credential) return 'not signed in'
  const bits: string[] = []
  if (credential.accessToken) bits.push('oauth')
  if (credential.apiKey) bits.push('api-key')
  if (credential.accountEmail) bits.push(credential.accountEmail)
  if (credential.expiresAt) {
    const seconds = Math.round((credential.expiresAt - Date.now()) / 1000)
    bits.push(seconds > 0 ? `expires ${formatSeconds(seconds)}` : 'expired (will refresh)')
  }
  return `stored (${bits.join(', ')})`
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
