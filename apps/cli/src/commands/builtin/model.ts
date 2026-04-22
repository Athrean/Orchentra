import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ModelCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'model',
    aliases: [],
    summary: 'Show or switch model',
    argumentHint: '[name]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const newModel = args.join(' ').trim()
    if (!newModel) {
      process.stdout.write(`Current model: ${ctx.session.getModel()}\n`)
      return true
    }
    ctx.session.setModel(newModel)
    process.stdout.write(`Switched model to: ${newModel}\n`)
    return true
  }
}
