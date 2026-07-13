import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import { createNonInteractiveLoginIo, createTerminalLoginIo, runLogin, type LoginIo } from '../run-auth'

export class LoginCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'login',
    aliases: ['li'],
    summary: 'Sign in to a provider — picker when no args, or /login <provider>',
    argumentHint: '[<provider>] [--api-key <key>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    if (args.length === 0 && ctx.ui) {
      ctx.ui({ kind: 'login-picker' })
      return true
    }

    const parsed = parseArgs(args)
    const io = loginIo(ctx, parsed.apiKey)
    if (parsed.error) {
      io.error(parsed.error)
      return false
    }
    return runLogin(parsed.provider, io)
  }
}

function loginIo(ctx: CommandContext, apiKey?: string): LoginIo {
  if (!ctx.ui) return createTerminalLoginIo(apiKey)
  return createNonInteractiveLoginIo({
    ...(apiKey ? { apiKey } : {}),
    out: (message) => ctx.ui?.({ kind: 'note', tone: 'info', text: message }),
    error: (message) => ctx.ui?.({ kind: 'note', tone: 'warn', text: message }),
  })
}

function parseArgs(args: readonly string[]): { provider?: string; apiKey?: string; error?: string } {
  const provider = args[0]
  let apiKey: string | undefined
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]
    if (argument !== '--api-key') return { provider, error: `login: unknown argument: ${argument}` }
    apiKey = args[++index]
    if (!apiKey) return { provider, error: 'login: --api-key requires a value' }
  }
  return { ...(provider ? { provider } : {}), ...(apiKey ? { apiKey } : {}) }
}
