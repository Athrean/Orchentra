import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { runTriage, type RunTriageOptions } from '../run-triage'
import { expandSpec } from '../expand-spec'
import { getActiveRepo as defaultGetActiveRepo } from '../../session-config'

export interface TriageSlashDeps {
  readonly runTriage?: (opts: RunTriageOptions) => Promise<number>
  readonly getActiveRepo?: () => string | null
}

export class TriageSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'triage',
    aliases: ['t'],
    summary: 'Triage a failing GitHub Actions run end-to-end (post check + PR comment)',
    argumentHint: '<owner/repo#runId>',
  }

  private readonly runFn: (opts: RunTriageOptions) => Promise<number>
  private readonly getActive: () => string | null

  constructor(deps: TriageSlashDeps = {}) {
    this.runFn = deps.runTriage ?? runTriage
    this.getActive = deps.getActiveRepo ?? defaultGetActiveRepo
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const expanded = expandSpec(args[0], this.getActive())
    if (!expanded) {
      const msg = 'usage: /triage <owner/repo#runId>. Tip: run /repos to set an active repo so a bare run id works.'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }
    // The triage workflow's effective default model is the SDK's default;
    // we surface the same string runTriage's verb path uses so behavior is
    // identical regardless of how triage is reached.
    const exit = await this.runFn({
      spec: expanded,
      model: process.env.ORCHESTRA_MODEL ?? 'claude-sonnet-4-20250514',
      permissionMode: 'workspace-write',
      cwd: ctx.cwd,
    })
    return exit === 0
  }
}
