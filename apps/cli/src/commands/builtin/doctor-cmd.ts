import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runDoctor } from '../doctor'

export class DoctorCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'doctor',
    aliases: [],
    summary: 'Run health checks on your setup',
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    process.stdout.write('Running diagnostics...\n\n')
    await runDoctor()
    return true
  }
}
