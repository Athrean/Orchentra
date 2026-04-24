import { clearCredential, listCredentialProviders, type ProviderKey } from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { authStateHint } from '../auth-state'
import { promptSelect } from '../../ui/select'

const SUPPORTED: readonly ProviderKey[] = ['anthropic', 'gemini', 'openai', 'xai', 'dashscope', 'github']

const PROVIDER_LABELS: Partial<Record<ProviderKey, string>> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Gemini (Google)',
  github: 'GitHub',
  openai: 'OpenAI',
  xai: 'xAI (Grok)',
  dashscope: 'DashScope (Qwen)',
}

export class LogoutCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'logout',
    aliases: [],
    summary: 'Remove stored credentials — picker when no args, or /logout <provider>',
    argumentHint: '[<provider>]',
  }

  async execute(args: string[], _ctx: CommandContext): Promise<boolean> {
    if (args.length === 0) {
      const picked = await pickSignedInProvider()
      if (!picked) return true
      return doLogout(picked)
    }
    const provider = (args[0] ?? '').toLowerCase() as ProviderKey | ''
    if (!provider || !SUPPORTED.includes(provider as ProviderKey)) {
      process.stderr.write(`unknown provider: ${provider}\n`)
      return false
    }
    return doLogout(provider as ProviderKey)
  }
}

async function pickSignedInProvider(): Promise<ProviderKey | null> {
  const signedIn = listCredentialProviders().filter((p): p is ProviderKey => SUPPORTED.includes(p as ProviderKey))
  if (signedIn.length === 0) {
    process.stdout.write('No stored credentials to remove.\n')
    return null
  }
  const result = await promptSelect<ProviderKey>({
    title: 'Choose a provider to sign out of:',
    options: signedIn.map((p) => ({
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

function doLogout(provider: ProviderKey): boolean {
  const removed = clearCredential(provider)
  if (removed) {
    process.stdout.write(`\x1b[32m✓\x1b[0m cleared stored credentials for ${provider}\n`)
  } else {
    process.stdout.write(`no stored credentials for ${provider}\n`)
  }
  return true
}
