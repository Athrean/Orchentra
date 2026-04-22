import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class CompactCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'compact',
    aliases: [],
    summary: 'Force context compaction',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    ctx.session.forceCompact()
    process.stdout.write('Compaction will be applied on next turn.\n')
    return true
  }
}
