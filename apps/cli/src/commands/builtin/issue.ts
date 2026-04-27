import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { resolveToken, GitHubClient } from '@orchentra/cli-api'
import type { UiKVRow } from '../ui-output'

export class IssueCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'issue',
    aliases: [],
    summary: 'List or create GitHub issues',
    argumentHint: '[list | create --title <t> --body <b>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const subcommand = args[0] ?? 'list'

    const remoteResult = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
      cwd: ctx.cwd,
      stdout: 'pipe',
    })
    const remoteUrl = new TextDecoder().decode(remoteResult.stdout).trim()
    const repoInfo = parseGitRemote(remoteUrl)
    if (!repoInfo) return note(ctx, 'error: could not determine owner/repo from git remote', 'warn')

    const token = resolveToken()
    if (!token) return note(ctx, 'error: GitHub token not found. Run `orchentra doctor` to diagnose.', 'warn')

    const client = new GitHubClient({ token: token.token })

    if (subcommand === 'create') return this.handleCreate(ctx, args, client, repoInfo)
    return this.handleList(ctx, client, repoInfo)
  }

  private async handleList(
    ctx: CommandContext,
    client: GitHubClient,
    repo: { owner: string; repo: string },
  ): Promise<boolean> {
    try {
      const result = await client.request<{
        total_count: number
        items: Array<{ number: number; title: string; state: string; html_url: string }>
      }>(`GET /search/issues`, {
        query: { q: `repo:${repo.owner}/${repo.repo} is:issue is:open`, sort: 'updated', per_page: 10 },
      })
      const items = result.items ?? []
      if (items.length === 0) return note(ctx, 'No open issues.')

      const rows: UiKVRow[] = items.map((it) => ({
        key: `#${it.number}`,
        value: `${it.title}  ${it.html_url}`,
      }))

      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Open issues',
          subtitle: `${repo.owner}/${repo.repo} · ${items.length} shown`,
          sections: [{ rows }],
        })
        return true
      }
      const w = Math.max(...rows.map((r) => r.key.length))
      for (const r of rows) process.stdout.write(`  ${r.key.padEnd(w)}  ${r.value}\n`)
      return true
    } catch (e) {
      return note(ctx, `error listing issues: ${(e as Error).message}`, 'warn')
    }
  }

  private async handleCreate(
    ctx: CommandContext,
    args: string[],
    client: GitHubClient,
    repo: { owner: string; repo: string },
  ): Promise<boolean> {
    const title = extractFlag(args, '--title') ?? extractFlag(args, '-t')
    const body = extractFlag(args, '--body') ?? extractFlag(args, '-b') ?? ''
    if (!title) return note(ctx, 'error: --title is required for issue creation', 'warn')
    try {
      const result = await client.request<{ number: number; html_url: string }>(
        `POST /repos/${repo.owner}/${repo.repo}/issues`,
        { body: { title, body } },
      )
      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Issue created',
          sections: [
            {
              rows: [
                { key: 'Number', value: `#${result.number}` },
                { key: 'Title', value: title },
                { key: 'URL', value: result.html_url },
              ],
            },
          ],
        })
      } else {
        process.stdout.write(`Issue #${result.number} created: ${result.html_url}\n`)
      }
      return true
    } catch (e) {
      return note(ctx, `error creating issue: ${(e as Error).message}`, 'warn')
    }
  }
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

function parseGitRemote(url: string): { owner: string; repo: string } | null {
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  const httpsMatch = url.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}
