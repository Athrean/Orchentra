import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runSummarize } from '../run-summarize'

export class SummarizeSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'summarize',
    aliases: [],
    summary: 'Extract root cause / where / fix from a failing GitHub Actions run',
    argumentHint: '<owner/repo#runId>',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const spec = args[0]
    if (!spec) {
      const msg = 'usage: /summarize <owner/repo#runId>'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }
    const exit = await runSummarize({
      spec,
      model: process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514',
      permissionMode: 'workspace-write',
      cwd: ctx.cwd,
    })
    return exit === 0
  }
}
