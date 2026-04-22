import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ModelCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'model',
    aliases: [],
    summary: 'Show or switch model',
    argumentHint: '[name]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim()
    if (!requested) {
      process.stdout.write(`Current model: ${ctx.session.getModel()}\n`)
      return true
    }
    const resolved = ctx.session.setModel(requested)
    if (resolved === requested) {
      process.stdout.write(`Switched model to: ${resolved}\n`)
    } else {
      process.stdout.write(`Switched model to: ${resolved} (from alias "${requested}")\n`)
    }
    return true
  }
}
