import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ClearCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'clear',
    aliases: ['cls', 'reset', 'new'],
    summary: 'Start a fresh session',
    argumentHint: '[--confirm]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const parsed = parseClearArgs(args)
    if (parsed.kind === 'error') {
      if (ctx.ui) ctx.ui({ kind: 'note', text: parsed.message, tone: 'warn' })
      else process.stdout.write(`${parsed.message}\n`)
      return true
    }

    if (ctx.session.startNewSession) await ctx.session.startNewSession()
    else ctx.session.clearHistory()
    if (ctx.ui) ctx.ui({ kind: 'clear-session', text: 'Conversation cleared.' })
    else process.stdout.write('Conversation cleared.\n')
    return true
  }
}

function parseClearArgs(args: string[]): { kind: 'ok' } | { kind: 'error'; message: string } {
  if (args.length === 0) return { kind: 'ok' }
  if (args.length === 1 && args[0] === '--confirm') return { kind: 'ok' }
  return {
    kind: 'error',
    message: `Unsupported /clear argument '${args.join(' ')}'. Use /clear or /clear --confirm.`,
  }
}
