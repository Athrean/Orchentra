import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ExitCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'exit',
    aliases: ['quit', 'q'],
    summary: 'Exit the REPL',
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    return false
  }
}
