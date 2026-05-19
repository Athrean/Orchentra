import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class ModelCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'model',
    aliases: ['m'],
    summary: 'Show or switch model',
    argumentHint: '[name]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim()

    // No arg + TUI mode → open the arrow-key picker overlay. Plain
    // (non-TUI) sessions keep the old text-only summary so scripts and
    // pipes don't hang on an interactive prompt.
    if (!requested) {
      if (ctx.ui) {
        ctx.ui({ kind: 'model-picker', current: ctx.session.getModel() })
        return true
      }
      process.stdout.write(`Current model: ${ctx.session.getModel()}\n`)
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
