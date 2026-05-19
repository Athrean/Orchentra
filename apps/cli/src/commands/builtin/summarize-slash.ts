import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runSummarize, type RunSummarizeOptions } from '../run-summarize'
import { expandSpec } from '../expand-spec'
import { getActiveRepo as defaultGetActiveRepo } from '../../session-config'

export interface SummarizeSlashDeps {
  readonly runSummarize?: (opts: RunSummarizeOptions) => Promise<number>
  readonly getActiveRepo?: () => string | null
}

export class SummarizeSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'summarize',
    aliases: [],
    summary: 'Extract root cause / where / fix from a failing GitHub Actions run',
    argumentHint: '<owner/repo#runId>',
  }

  private readonly runFn: (opts: RunSummarizeOptions) => Promise<number>
  private readonly getActive: () => string | null

  constructor(deps: SummarizeSlashDeps = {}) {
    this.runFn = deps.runSummarize ?? runSummarize
    this.getActive = deps.getActiveRepo ?? defaultGetActiveRepo
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const expanded = expandSpec(args[0], this.getActive())
    if (!expanded) {
      const msg = 'usage: /summarize <owner/repo#runId>. Tip: run /repos to set an active repo so a bare run id works.'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }
    const exit = await this.runFn({
      spec: expanded,
      model: process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514',
      permissionMode: 'workspace-write',
      cwd: ctx.cwd,
    })
    return exit === 0
  }
}
