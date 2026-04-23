import { clearCredential, type ProviderKey } from '@orchentra/cli-api'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

const SUPPORTED: readonly ProviderKey[] = [
  'anthropic',
  'gemini',
  'openai',
  'xai',
  'dashscope',
  'github',
]

export class LogoutCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'logout',
    aliases: [],
    summary: 'Remove stored credentials for a provider',
    argumentHint: '<provider>',
  }

  async execute(args: string[], _ctx: CommandContext): Promise<boolean> {
    const provider = (args[0] ?? '').toLowerCase() as ProviderKey | ''
    if (!provider) {
      process.stdout.write('Usage: /logout <provider>\n')
      return true
    }
    if (!SUPPORTED.includes(provider as ProviderKey)) {
      process.stderr.write(`unknown provider: ${provider}\n`)
      return false
    }
    const removed = clearCredential(provider as ProviderKey)
    if (removed) {
      process.stdout.write(`✓ cleared stored credentials for ${provider}\n`)
    } else {
      process.stdout.write(`no stored credentials for ${provider}\n`)
    }
    return true
  }
}
