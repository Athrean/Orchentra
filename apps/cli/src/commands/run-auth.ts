import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import {
  clearCredential,
  credentialsPath,
  getCredential,
  importAntigravityCliAuth,
  importCodexCliAuth,
  listCredentialProviders,
  loadClaudeCodeOauth,
  loginAnthropic,
  loginAntigravity,
  loginCodex,
  loginGemini,
  loginWithDeviceFlow,
  MacKeychain,
  saveCredentialAsync,
  tryLoadKeytar,
  type ProviderKey,
} from '@orchentra/cli-api'
import { promptSelect } from '../ui/select'
import { authStateHint } from './auth-state'

/**
 * Providers signed in through a browser rather than a pasted key. `anthropic`
 * and `openai` appear here *and* in the API-key list: both accept a
 * subscription sign-in (Claude Pro/Max, ChatGPT Plus/Pro) or a console key, and
 * `--api-key` picks the latter without a second provider name.
 */
const OAUTH_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'openai', 'antigravity', 'gemini', 'github']
const API_KEY_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'openai', 'xai', 'dashscope', 'zen']
export const LOGIN_PROVIDERS: readonly ProviderKey[] = [
  ...OAUTH_PROVIDERS,
  ...API_KEY_PROVIDERS.filter((p) => !OAUTH_PROVIDERS.includes(p)),
]

const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude Pro/Max or API key)',
  antigravity: 'Google Antigravity (AI Pro/Ultra)',
  gemini: 'Gemini (Google API)',
  github: 'GitHub',
  openai: 'OpenAI (ChatGPT Plus/Pro or API key)',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
  zen: 'opencode Zen / Go',
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
  /**
   * Read a pasted authorization code. Anthropic's console flow redirects to a
   * page that displays the code rather than to a loopback port, so that one
   * provider needs a paste step the others do not.
   */
  promptCode(label: string): Promise<string | null>
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

    if (selected === 'anthropic') return await signInAnthropic(io)
    if (selected === 'openai') return await signInCodex(io)
    if (selected === 'antigravity') return await signInAntigravity(io)
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
    promptCode: async (label) => readLineFromStdin(label),
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
    promptCode: async () => null,
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

/**
 * Claude Pro/Max sign-in. An existing Claude Code login on this machine is
 * adopted first: the credential is already on the keychain, and reusing it
 * spares the user a second browser round-trip.
 */
async function signInAnthropic(io: LoginIo): Promise<boolean> {
  if (MacKeychain.available()) {
    const existing = await loadClaudeCodeOauth(new MacKeychain()).catch(() => null)
    if (existing?.accessToken) {
      const shim = await tryLoadKeytar()
      await saveCredentialAsync('anthropic', existing, undefined, shim)
      io.out('✓ Imported the Claude Code sign-in already on this machine')
      return true
    }
  }
  io.out('Sign in with Claude — use your Claude Pro or Max subscription.')
  const result = await loginAnthropic({
    onAuthUrl: async (url) => {
      await io.openBrowser(url)
      io.out(`Approve access in your browser. If it did not open, visit:\n${url}`)
    },
    promptForCode: async () => {
      const pasted = await io.promptCode('Paste the code shown after approving: ')
      if (!pasted?.trim()) throw new Error('no authorization code provided')
      return pasted.trim()
    },
  })
  const where = result.persistedPath ? ` (${result.persistedPath})` : ''
  io.out(`✓ Connected to Claude${where}`)
  return true
}

/**
 * ChatGPT sign-in. Plans with a platform organization mint a normal API key;
 * personal Plus/Pro plans cannot, and run through the ChatGPT backend instead —
 * `loginCodex` reports which happened.
 */
async function signInCodex(io: LoginIo): Promise<boolean> {
  const imported = importCodexCliAuth()
  if (imported) {
    io.out('✓ Imported the Codex CLI sign-in already on this machine')
    return true
  }
  io.out('Sign in with ChatGPT — use your ChatGPT Plus or Pro subscription.')
  const result = await loginCodex({
    onAuthUrl: async (url) => {
      await io.openBrowser(url)
      io.out(`Approve access in your browser. If it did not open, visit:\n${url}\nWaiting for browser…`)
    },
  })
  const account = result.email ? ` (${result.email})` : ''
  io.out(
    result.mode === 'api-key'
      ? `✓ Connected to OpenAI${account} — minted a platform API key`
      : `✓ Connected to ChatGPT${account} — running through the ChatGPT backend`,
  )
  return true
}

/**
 * Antigravity sign-in — the successor to Google's retired free coding tier. An
 * existing Antigravity CLI login is adopted from the keychain first, the same
 * way the Claude and ChatGPT flows adopt theirs.
 */
async function signInAntigravity(io: LoginIo): Promise<boolean> {
  const imported = await importAntigravityCliAuth().catch(() => null)
  if (imported) {
    io.out('✓ Imported the Antigravity CLI sign-in already on this machine')
    return true
  }
  io.out('Sign in with Google — use the account carrying your Antigravity (AI Pro/Ultra) plan.')
  const result = await loginAntigravity({
    onAuthUrl: async (url) => {
      await io.openBrowser(url)
      io.out(`Approve access in your browser. If it did not open, visit:\n${url}\nWaiting for browser…`)
    },
  })
  const account = result.accountEmail ? ` (${result.accountEmail})` : ''
  io.out(`✓ Connected to Antigravity${account}`)
  return true
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
