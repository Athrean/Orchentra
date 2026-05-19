import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { clean as defaultClean, type CleanOptions, type CleanResult, type CleanSummary } from '../../composites/clean'
import { expandSpec } from '../expand-spec'
import { getActiveRepo as defaultGetActiveRepo } from '../../session-config'

export interface CleanSlashDeps {
  readonly clean?: (opts: CleanOptions) => Promise<CleanResult>
  readonly getActiveRepo?: () => string | null
}

export class CleanSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'clean',
    aliases: [],
    summary: 'Prune expired GitHub Actions artifacts from old failed runs (approval-gated)',
    argumentHint: '<owner/repo> [--dry-run] [--older-than-days <N>]',
  }

  private readonly cleanFn: (opts: CleanOptions) => Promise<CleanResult>
  private readonly getActive: () => string | null

  constructor(deps: CleanSlashDeps = {}) {
    this.cleanFn = deps.clean ?? defaultClean
    this.getActive = deps.getActiveRepo ?? defaultGetActiveRepo
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const firstPositional = args.find((a) => !a.startsWith('-'))
    const expanded = expandSpec(firstPositional, this.getActive())

    if (!expanded || !expanded.includes('/')) {
      const msg =
        'usage: /clean <owner/repo> [--dry-run] [--older-than-days <N>]. Tip: run /repos to set an active repo so the positional arg becomes optional.'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }

    const [owner, repo] = expanded.split('/', 2)
    let dryRun = false
    let olderThanDays = 14
    for (let i = 0; i < args.length; i++) {
      const tok = args[i]
      if (tok === '--dry-run') dryRun = true
      else if (tok === '--older-than-days') olderThanDays = Number(args[++i])
    }

    const result = await this.cleanFn({
      owner,
      repo,
      dryRun,
      olderThanDays,
      approve: async (summary: CleanSummary) => {
        const lines = [
          `Will delete ${summary.expiredArtifacts.length} expired artifact(s) (~${(summary.totalSizeBytes / 1024).toFixed(1)} KiB) across ${summary.oldRuns.length} old runs.`,
          ...summary.expiredArtifacts.map(
            (a) => `  - ${a.name} (run ${a.runId}, ${(a.sizeInBytes / 1024).toFixed(1)} KiB)`,
          ),
        ].join('\n')
        if (ctx.ui) ctx.ui({ kind: 'text', text: lines })
        else process.stdout.write(lines + '\n')
        // No interactive prompt is wired yet for the TUI; default-deny when
        // a real human sink would be needed. Composite tests always inject
        // their own approve() so this branch only fires in production-TUI
        // until the prompt is added in a follow-up slice.
        return false
      },
    })

    const summary = `cleaned ${result.deleted.length} artifact(s); skipped ${result.skipped.length}.`
    if (ctx.ui) ctx.ui({ kind: 'text', text: summary })
    else process.stdout.write(summary + '\n')
    return true
  }
}
