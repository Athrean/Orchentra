import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { clean, type CleanSummary } from '../../composites/clean'

export class CleanSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'clean',
    aliases: [],
    summary: 'Prune expired GitHub Actions artifacts from old failed runs (approval-gated)',
    argumentHint: '<owner/repo> [--dry-run] [--older-than-days <N>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const spec = args[0]
    if (!spec || !spec.includes('/')) {
      const msg = 'usage: /clean <owner/repo> [--dry-run] [--older-than-days <N>]'
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: msg })
      else process.stderr.write(msg + '\n')
      return false
    }
    const [owner, repo] = spec.split('/', 2)
    let dryRun = false
    let olderThanDays = 14
    for (let i = 1; i < args.length; i++) {
      const tok = args[i]
      if (tok === '--dry-run') dryRun = true
      else if (tok === '--older-than-days') olderThanDays = Number(args[++i])
    }

    const result = await clean({
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
