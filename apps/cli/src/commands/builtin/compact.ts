import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class CompactCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'compact',
    aliases: [],
    summary: 'Force context compaction',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    ctx.session.forceCompact()
    const text = 'Compaction will be applied on next turn.'
    if (ctx.ui) ctx.ui({ kind: 'note', text })
    else process.stdout.write(text + '\n')
    return true
  }
}
