import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import {
  loginGemini,
  loginWithDeviceFlow,
  saveCredentialAsync,
  tryLoadKeytar,
  type ProviderKey,
} from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { authStateHint } from '../auth-state'
import { promptSelect } from '../../ui/select'
import { runAnthropicLoginFlow } from '../../ui/anthropic-login-flow'

const OAUTH_PROVIDERS: readonly ProviderKey[] = ['anthropic', 'gemini', 'github']
const API_KEY_PROVIDERS: readonly ProviderKey[] = ['openai', 'xai', 'dashscope']
const SUPPORTED: readonly ProviderKey[] = [...OAUTH_PROVIDERS, ...API_KEY_PROVIDERS]

// GitHub OAuth client ID — public, distributed with the CLI for device flow.
const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  anthropic: 'Anthropic (Claude Pro/Max)',
  gemini: 'Gemini (Google)',
  github: 'GitHub',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  orchentra: 'Orchentra Server',
}

export class LoginCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'login',
    aliases: [],
    summary: 'Sign in to a provider — picker when no args, or /login <provider>',
    argumentHint: '[<provider>] [--api-key <key>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const inTui = ctx.ui !== undefined

    if (args.length === 0) {
      if (inTui) {
        emitTuiLoginInstructions(ctx)
        return true
      }
      const provider = await pickProvider()
      if (!provider) return true
      return await runProvider(provider)
    }

    const provider = (args[0] ?? '').toLowerCase() as ProviderKey | ''
    if (!provider || !SUPPORTED.includes(provider as ProviderKey)) {
      process.stderr.write(`unknown provider: ${provider}\n${usage()}`)
      return false
    }

    const apiKey = extractFlag(args, '--api-key')
    if (apiKey) {
      if (inTui) {
        await saveApiKeyToBackend(provider as ProviderKey, apiKey)
        ctx.ui?.({ kind: 'note', tone: 'info', text: `✓ saved ${provider} API key to OS keychain` })
        return true
      }
      return await saveApiKey(provider as ProviderKey, apiKey)
    }

    if (inTui) {
      emitTuiLoginInstructions(ctx, provider as ProviderKey)
      return true
    }
    return await runProvider(provider as ProviderKey)
  }
}

// Anthropic login runs as a native Ink overlay inside the TUI — we emit a
// `login-flow` UI event and the TUI takes over input until the OAuth code
// has been exchanged. Other OAuth providers haven't been ported yet and
// still need a fresh terminal, so we keep the legacy fallback for them.
function emitTuiLoginInstructions(ctx: CommandContext, provider?: ProviderKey): void {
  if (provider === 'anthropic') {
    ctx.ui?.({ kind: 'login-flow', provider: 'anthropic' })
    return
  }

  const target = provider ? `orchentra login ${provider}` : 'orchentra login'
  const apiKeyHint = provider && API_KEY_PROVIDERS.includes(provider) ? ` --api-key <key>` : ''
  ctx.ui?.({
    kind: 'card',
    title: 'Sign in',
    subtitle: 'OAuth flows need a clean terminal — run from your shell',
    sections: [
      {
        title: 'Run in a fresh terminal',
        rows: [{ key: '$', value: `${target}${apiKeyHint}` }],
      },
      {
        title: 'After login',
        rows: [
          { key: '1', value: 'credentials saved to ~/.config/orchentra/credentials.json' },
          { key: '2', value: 'restart orchentra — TUI will pick up the new token' },
          { key: '3', value: 'expired tokens refresh automatically' },
        ],
      },
      {
        title: 'Or pass an API key inline',
        rows: [{ key: '/login', value: '<provider> --api-key <key>' }],
      },
    ],
  })
}

async function pickProvider(): Promise<ProviderKey | null> {
  const result = await promptSelect<ProviderKey>({
    title: 'Choose a provider to sign in:',
    options: SUPPORTED.map((p) => ({
      value: p,
      label: PROVIDER_LABELS[p],
      hint: authStateHint(p),
    })),
  })
  if (result.type === 'cancelled') {
    process.stdout.write('cancelled\n')
    return null
  }
  return result.value
}

async function runProvider(provider: ProviderKey): Promise<boolean> {
  try {
    if (provider === 'anthropic') return await doAnthropic()
    if (provider === 'gemini') return await doGemini()
    if (provider === 'github') return await doGithub()
    if (API_KEY_PROVIDERS.includes(provider)) return await doApiKey(provider)
    process.stderr.write(`no login flow for ${provider}\n`)
    return false
  } catch (err) {
    process.stderr.write(`login failed: ${(err as Error).message}\n`)
    return false
  }
}

async function saveApiKeyToBackend(provider: ProviderKey, apiKey: string): Promise<void> {
  const shim = await tryLoadKeytar()
  await saveCredentialAsync(provider, { apiKey }, undefined, shim)
}

async function saveApiKey(provider: ProviderKey, apiKey: string): Promise<boolean> {
  await saveApiKeyToBackend(provider, apiKey)
  process.stdout.write(`✓ saved ${provider} API key to OS keychain\n`)
  return true
}

async function doAnthropic(): Promise<boolean> {
  const result = await runAnthropicLoginFlow()
  if (!result.ok) {
    process.stderr.write(`  \x1b[31m${result.message}\x1b[0m\n`)
    return false
  }
  return true
}

function printHeader(title: string, subtitle: string): void {
  process.stdout.write('\n')
  process.stdout.write(`  \x1b[1m${title}\x1b[0m\n`)
  process.stdout.write(`  \x1b[2m${subtitle}\x1b[0m\n`)
}

async function doGemini(): Promise<boolean> {
  printHeader('Sign in with Google', 'Use your Google account for Gemini.')
  const result = await loginGemini({
    onAuthUrl: async (url) => {
      await openInBrowser(url)
      process.stdout.write('\n  A browser tab has opened. Approve access to continue.\n')
      process.stdout.write(`  If the browser didn't open, visit:\n  \x1b[2m${url}\x1b[0m\n\n`)
      process.stdout.write('  Waiting for browser…\n')
    },
  })
  const account = result.accountEmail ? `  \x1b[2m(${result.accountEmail})\x1b[0m` : ''
  process.stdout.write(`\n\x1b[32m✓ Connected to Gemini\x1b[0m${account}\n`)
  return true
}

async function doGithub(): Promise<boolean> {
  printHeader('Sign in to GitHub', 'Device-flow sign-in for PRs, issues, and Actions.')
  const result = await loginWithDeviceFlow({
    clientId: GITHUB_OAUTH_CLIENT_ID,
    onUserCode: ({ userCode, verificationUri }) => {
      process.stdout.write(`\n  1. Open \x1b[36m${verificationUri}\x1b[0m\n`)
      process.stdout.write(`  2. Enter code: \x1b[1m${userCode}\x1b[0m\n\n`)
      process.stdout.write('  Waiting for authorization…\n')
    },
  })
  process.stdout.write(
    `\n\x1b[32m✓ Connected to GitHub\x1b[0m${result.persistedPath ? `  \x1b[2m(${result.persistedPath})\x1b[0m` : ''}\n`,
  )
  return true
}

async function doApiKey(provider: ProviderKey): Promise<boolean> {
  const label = PROVIDER_LABELS[provider]
  const envVars: Record<string, string> = {
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
  const apiKey = (await readLineFromStdin('  API key: ')).trim()
  if (!apiKey) {
    process.stdout.write('\n  cancelled\n')
    return true
  }
  await saveApiKeyToBackend(provider, apiKey)
  process.stdout.write(`\n\x1b[32m✓ Saved ${provider} API key\x1b[0m  \x1b[2m(OS keychain)\x1b[0m\n`)
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

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx === args.length - 1) return null
  return args[idx + 1]
}

function usage(): string {
  return (
    [
      'Usage:',
      '  /login                        open picker',
      '  /login <provider>             sign in to one provider',
      '  /login <provider> --api-key <key>',
      '',
      'Providers:',
      '  anthropic   OAuth (Claude Pro/Max subscription)',
      '  gemini      OAuth (Google)',
      '  github      Device flow (PRs/issues/Actions)',
      '  openai      API key (pass --api-key or enter when prompted)',
      '  xai         API key',
      '  dashscope   API key',
      '',
    ].join('\n') + '\n'
  )
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
    /* fall back to printed URL */
  }
}
