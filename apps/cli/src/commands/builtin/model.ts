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
      const text = `Current model: ${ctx.session.getModel()}`
      if (ctx.ui) ctx.ui({ kind: 'note', text })
      else process.stdout.write(text + '\n')
      return true
    }
    const resolved = ctx.session.setModel(requested)
    const text =
      resolved === requested
        ? `Switched model to: ${resolved}`
        : `Switched model to: ${resolved} (from alias "${requested}")`
    if (ctx.ui) ctx.ui({ kind: 'note', text })
    else process.stdout.write(text + '\n')
    return true
  }
}
