import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { resolveToken, GitHubClient } from '@orchentra/cli-api'

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
    if (!repoInfo) {
      process.stdout.write('error: could not determine owner/repo from git remote\n')
      return true
    }

    const token = resolveToken()
    if (!token) {
      process.stdout.write('error: GitHub token not found. Run `orchentra doctor` to diagnose.\n')
      return true
    }
    const client = new GitHubClient({ token: token.token })

    if (subcommand === 'create') {
      return this.handleCreate(args, client, repoInfo)
    }
    return this.handleList(client, repoInfo)
  }

  private async handleList(client: GitHubClient, repo: { owner: string; repo: string }): Promise<boolean> {
    try {
      const result = await client.request<{
        total_count: number
        items: Array<{ number: number; title: string; state: string; html_url: string }>
      }>(`GET /search/issues`, {
        query: { q: `repo:${repo.owner}/${repo.repo} is:issue is:open`, sort: 'updated', per_page: 10 },
      })
      const items = result.items ?? []
      if (items.length === 0) {
        process.stdout.write('No open issues.\n')
        return true
      }
      for (const item of items) {
        process.stdout.write(`  #${item.number} ${item.title}\n    ${item.html_url}\n`)
      }
    } catch (e) {
      process.stdout.write(`error listing issues: ${(e as Error).message}\n`)
    }
    return true
  }

  private async handleCreate(
    args: string[],
    client: GitHubClient,
    repo: { owner: string; repo: string },
  ): Promise<boolean> {
    const title = extractFlag(args, '--title') ?? extractFlag(args, '-t')
    const body = extractFlag(args, '--body') ?? extractFlag(args, '-b') ?? ''
    if (!title) {
      process.stdout.write('error: --title is required for issue creation\n')
      return true
    }
    try {
      const result = await client.request<{ number: number; html_url: string }>(
        `POST /repos/${repo.owner}/${repo.repo}/issues`,
        { body: { title, body } },
      )
      process.stdout.write(`Issue #${result.number} created: ${result.html_url}\n`)
    } catch (e) {
      process.stdout.write(`error creating issue: ${(e as Error).message}\n`)
    }
    return true
  }
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
