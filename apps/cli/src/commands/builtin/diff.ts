import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { gitCommandEnv, runProcessSync } from '@orchentra/cli-core'

export class DiffCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'diff',
    aliases: ['d'],
    summary: 'Show uncommitted changes',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    try {
      const stdout = runProcessSync(['git', 'diff', '--stat'], { cwd: ctx.cwd, env: gitCommandEnv() }).stdout.trim()
      const text = stdout.length > 0 ? stdout : 'No uncommitted changes.'
      if (ctx.ui) ctx.ui({ kind: 'text', text })
      else process.stdout.write(text + '\n')
    } catch {
      const text = 'Could not run git diff.'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text })
      else process.stdout.write(text + '\n')
    }
    return true
  }
}
