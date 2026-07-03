import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ClearCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'clear',
    aliases: ['cls'],
    summary: 'Clear conversation history',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    if (ctx.session.startNewSession) await ctx.session.startNewSession()
    else ctx.session.clearHistory()
    if (ctx.ui) ctx.ui({ kind: 'clear-session', text: 'Conversation cleared.' })
    else process.stdout.write('Conversation cleared.\n')
    return true
  }
}
