import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { envList, envSet, envSync } from '../../composites/env'

export class EnvSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'env',
    aliases: [],
    summary: 'List, set, or sync GitHub Actions secrets (values never read back)',
    argumentHint: 'list|set|sync <owner/repo> [--from <.env>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const sub = args[0]
    const spec = args[1]
    if (!sub || !spec || !spec.includes('/')) {
      return this.usage(ctx)
    }
    const [owner, repo] = spec.split('/', 2)

    if (sub === 'list') {
      const res = await envList(owner, repo)
      if ('error' in res) return this.note(ctx, `error: ${res.error}`, true)
      const lines = res.secrets.map((s) => `  ${s.name}  (updated ${s.updatedAt})`)
      this.text(ctx, lines.join('\n') || '(no secrets configured)')
      return true
    }

    if (sub === 'set') {
      const name = args[2]
      const value = args[3]
      if (!name || value === undefined) return this.note(ctx, 'usage: /env set <owner/repo> <NAME> <VALUE>', true)
      const res = await envSet(owner, repo, name, value)
      if ('error' in res) return this.note(ctx, `error: ${res.error}`, true)
      this.text(ctx, `✓ wrote ${res.secretName}`)
      return true
    }

    if (sub === 'sync') {
      const fromFlagIdx = args.indexOf('--from')
      const fromPath = fromFlagIdx >= 0 ? args[fromFlagIdx + 1] : '.env'
      let body: string
      try {
        body = await readFile(resolve(ctx.cwd, fromPath), 'utf-8')
      } catch (err) {
        return this.note(
          ctx,
          `error: cannot read ${fromPath}: ${err instanceof Error ? err.message : String(err)}`,
          true,
        )
      }
      const result = await envSync({
        owner,
        repo,
        envFileText: body,
        approve: async (names) => {
          this.text(
            ctx,
            `Will write ${names.length} secret(s) to ${owner}/${repo}:\n${names.map((n) => `  - ${n}`).join('\n')}`,
          )
          // No interactive approval prompt yet — default-deny in production.
          // Tests inject their own approve callback.
          return false
        },
      })
      this.text(ctx, `synced ${result.synced.length}; skipped ${result.skipped.length}.`)
      return true
    }

    return this.usage(ctx)
  }

  private usage(ctx: CommandContext): boolean {
    return this.note(
      ctx,
      'usage: /env list|set|sync <owner/repo> [--from <.env>]\n' +
        '  /env list <owner/repo>                         # show secret names + updated_at\n' +
        '  /env set <owner/repo> <NAME> <VALUE>           # write one secret\n' +
        '  /env sync <owner/repo> [--from <.env>]         # write every key from a local .env',
      true,
    )
  }

  private text(ctx: CommandContext, msg: string): void {
    if (ctx.ui) ctx.ui({ kind: 'text', text: msg })
    else process.stdout.write(msg + '\n')
  }

  private note(ctx: CommandContext, msg: string, warn: boolean): boolean {
    if (ctx.ui) ctx.ui({ kind: 'note', tone: warn ? 'warn' : 'info', text: msg })
    else process.stderr.write(msg + '\n')
    return false
  }
}
