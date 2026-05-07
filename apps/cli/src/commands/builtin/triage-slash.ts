import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runTriage } from '../run-triage'

export class TriageSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'triage',
    aliases: [],
    summary: 'Triage a failing GitHub Actions run end-to-end (post check + PR comment)',
    argumentHint: '<owner/repo#runId>',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const spec = args[0]
    if (!spec) {
      const msg = 'usage: /triage <owner/repo#runId>'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }
    // The triage workflow's effective default model is the SDK's default;
    // we surface the same string runTriage's verb path uses so behavior is
    // identical regardless of how triage is reached.
    const exit = await runTriage({
      spec,
      model: process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514',
      permissionMode: 'workspace-write',
      cwd: ctx.cwd,
    })
    return exit === 0
  }
}
