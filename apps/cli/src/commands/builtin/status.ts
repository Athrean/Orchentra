import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class StatusCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'status',
    aliases: [],
    summary: 'Show model, permission mode, session info',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const lines = [
      `Model: ${ctx.session.getModel()}`,
      `Permission: ${ctx.session.getPermissionMode()}`,
      `Session: ${ctx.session.getSessionId().slice(0, 8)}...`,
      `Turns: ${ctx.session.getTurns()}`,
      `CWD: ${ctx.cwd}`,
    ]
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
