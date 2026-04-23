import { spawn } from 'node:child_process'
import {
  loginAnthropic,
  loginGemini,
  loginWithDeviceFlow,
  saveCredential,
  type ProviderKey,
} from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

const SUPPORTED: readonly ProviderKey[] = [
  'anthropic',
  'gemini',
  'openai',
  'xai',
  'dashscope',
  'github',
]

// GitHub OAuth client ID — public, distributed with the CLI for device flow.
const GITHUB_OAUTH_CLIENT_ID = process.env['ORCHENTRA_GITHUB_OAUTH_CLIENT_ID'] ?? 'Iv1.b507a08c87ecfe98'

export class LoginCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'login',
    aliases: [],
    summary: 'Sign in to a provider (anthropic | gemini | openai | xai | dashscope | github)',
    argumentHint: '<provider> [--api-key <key>]',
  }

  async execute(args: string[], _ctx: CommandContext): Promise<boolean> {
    const provider = (args[0] ?? '').toLowerCase() as ProviderKey | ''
    if (!provider) {
      process.stdout.write(usage())
      return true
    }
    if (!SUPPORTED.includes(provider as ProviderKey)) {
      process.stderr.write(`unknown provider: ${provider}\n${usage()}`)
      return false
    }

    const apiKey = extractFlag(args, '--api-key')
    if (apiKey) {
      return saveApiKey(provider as ProviderKey, apiKey)
    }

    try {
      switch (provider) {
        case 'anthropic':
          return await doAnthropic()
        case 'gemini':
          return await doGemini()
        case 'github':
          return await doGithub()
        case 'openai':
        case 'xai':
        case 'dashscope':
          process.stderr.write(
            `${provider} does not support OAuth. Pass an API key:\n  /login ${provider} --api-key <key>\n`,
          )
          return false
        default:
          return false
      }
    } catch (err) {
      process.stderr.write(`login failed: ${(err as Error).message}\n`)
      return false
    }
  }
}

function saveApiKey(provider: ProviderKey, apiKey: string): boolean {
  const path = saveCredential(provider, { apiKey })
  process.stdout.write(`✓ saved ${provider} API key → ${path}\n`)
  return true
}

async function doAnthropic(): Promise<boolean> {
  process.stdout.write('Signing in to Claude (Pro/Max subscription)…\n')
  const result = await loginAnthropic({
    onAuthUrl: async (url) => {
      process.stdout.write(`\nOpen this URL to authorize:\n  ${url}\n`)
      await openInBrowser(url)
      process.stdout.write('\nWaiting for you to complete the browser flow…\n')
    },
  })
  process.stdout.write(
    `✓ signed in to Claude${result.persistedPath ? `  (saved to ${result.persistedPath})` : ''}\n`,
  )
  return true
}

async function doGemini(): Promise<boolean> {
  process.stdout.write('Signing in to Google (Gemini)…\n')
  const result = await loginGemini({
    onAuthUrl: async (url) => {
      process.stdout.write(`\nOpen this URL to authorize:\n  ${url}\n`)
      await openInBrowser(url)
      process.stdout.write('\nWaiting for you to complete the browser flow…\n')
    },
  })
  const account = result.accountEmail ? ` as ${result.accountEmail}` : ''
  process.stdout.write(
    `✓ signed in to Gemini${account}${result.persistedPath ? `  (saved to ${result.persistedPath})` : ''}\n`,
  )
  return true
}

async function doGithub(): Promise<boolean> {
  process.stdout.write('Signing in to GitHub (device flow)…\n')
  const result = await loginWithDeviceFlow({
    clientId: GITHUB_OAUTH_CLIENT_ID,
    onUserCode: ({ userCode, verificationUri }) => {
      process.stdout.write(
        `\nOpen: ${verificationUri}\nEnter code: ${userCode}\n\nWaiting for authorization…\n`,
      )
    },
  })
  process.stdout.write(
    `✓ signed in to GitHub${result.persistedPath ? `  (saved to ${result.persistedPath})` : ''}\n`,
  )
  return true
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx === args.length - 1) return null
  return args[idx + 1]
}

function usage(): string {
  return [
    'Usage:',
    '  /login <provider> [--api-key <key>]',
    '',
    'Providers:',
    '  anthropic   OAuth sign-in with your Claude Pro/Max subscription',
    '  gemini      OAuth sign-in with your Google account',
    '  github      Device-flow sign-in for PRs/issues/Actions',
    '  openai      API key only — pass --api-key <sk-…>',
    '  xai         API key only — pass --api-key <key>',
    '  dashscope   API key only — pass --api-key <key>',
    '',
  ].join('\n') + '\n'
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
