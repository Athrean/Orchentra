import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class DiffCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'diff',
    aliases: [],
    summary: 'Show uncommitted changes',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    try {
      const proc = Bun.spawnSync(['git', 'diff', '--stat'], {
        cwd: ctx.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stdout = new TextDecoder().decode(proc.stdout).trim()
      if (stdout) {
        process.stdout.write(stdout + '\n')
      } else {
        process.stdout.write('No uncommitted changes.\n')
      }
    } catch {
      process.stdout.write('Could not run git diff.\n')
    }
    return true
  }
}
