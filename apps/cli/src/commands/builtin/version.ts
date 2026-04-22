import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { CLI_NAME, CLI_VERSION } from '../../version'

export class VersionCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'version',
    aliases: ['v'],
    summary: 'Show version',
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
    return true
  }
}
