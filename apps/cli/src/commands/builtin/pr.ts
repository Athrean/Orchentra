import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { resolveToken, createPullRequest, findOpenPullByHead, GitHubClient } from '@orchentra/cli-api'

export class PrCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'pr',
    aliases: [],
    summary: 'Create or update a pull request',
    argumentHint: '[--title <t>] [--base <branch>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const title = extractFlag(args, '--title')
    const base = extractFlag(args, '--base') ?? 'main'

    // Get current branch
    const branchResult = Bun.spawnSync(['git', 'branch', '--show-current'], {
      cwd: ctx.cwd,
      stdout: 'pipe',
    })
    const branch = new TextDecoder().decode(branchResult.stdout).trim()
    if (!branch || branch === base) {
      return note(
        ctx,
        `error: current branch "${branch}" is not a valid PR branch (must differ from base "${base}")`,
        'warn',
      )
    }

    // Detect remote repo
    const remoteResult = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], {
      cwd: ctx.cwd,
      stdout: 'pipe',
    })
    const remoteUrl = new TextDecoder().decode(remoteResult.stdout).trim()
    const repoInfo = parseGitRemote(remoteUrl)
    if (!repoInfo) {
      return note(ctx, 'error: could not determine owner/repo from git remote', 'warn')
    }

    note(ctx, `Pushing ${branch}…`)
    const pushResult = Bun.spawnSync(['git', 'push', '-u', 'origin', branch], {
      cwd: ctx.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    if (pushResult.exitCode !== 0) {
      const stdout = new TextDecoder().decode(pushResult.stdout).trim()
      const stderr = new TextDecoder().decode(pushResult.stderr).trim()
      return note(ctx, `error: git push failed (exit ${pushResult.exitCode})\n${stderr || stdout}`, 'warn')
    }

    // Create PR
    const token = resolveToken()
    if (!token) {
      return note(ctx, 'error: GitHub token not found. Run `orchentra doctor` to diagnose.', 'warn')
    }

    const client = new GitHubClient({ token: token.token })
    const prTitle = title ?? generatePrTitle(branch)
    const body = generatePrBody(branch)

    // Check for existing PR
    const existing = await findOpenPullByHead(client, repoInfo.owner, repoInfo.repo, branch)
    if (existing) {
      return prCard(ctx, 'PR already exists', existing.html_url, prTitle, branch, base)
    }

    try {
      const pr = await createPullRequest(client, repoInfo.owner, repoInfo.repo, {
        title: prTitle,
        head: branch,
        base,
        body,
      })
      return prCard(ctx, 'PR created', pr.html_url, prTitle, branch, base)
    } catch (e) {
      return note(ctx, `error creating PR: ${(e as Error).message}`, 'warn')
    }
  }
}

function note(ctx: CommandContext, text: string, tone: 'info' | 'warn' = 'info'): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
  return true
}

function prCard(
  ctx: CommandContext,
  title: string,
  url: string,
  prTitle: string,
  branch: string,
  base: string,
): boolean {
  if (ctx.ui) {
    ctx.ui({
      kind: 'card',
      title,
      sections: [
        {
          rows: [
            { key: 'Title', value: prTitle },
            { key: 'Branch', value: `${branch} → ${base}` },
            { key: 'URL', value: url },
          ],
        },
      ],
    })
  } else {
    process.stdout.write(`${title}: ${url}\n`)
  }
  return true
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

function parseGitRemote(url: string): { owner: string; repo: string } | null {
  // ssh: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] }
  // https: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] }
  return null
}

function generatePrTitle(branch: string): string {
  if (branch.startsWith('feat/')) return `feat: ${branch.slice(5)}`
  if (branch.startsWith('fix/')) return `fix: ${branch.slice(4)}`
  if (branch.startsWith('chore/')) return `chore: ${branch.slice(6)}`
  return branch
}

function generatePrBody(branch: string): string {
  return `## Summary\n\nChanges from \`${branch}\`.\n\n## Test plan\n\n- [ ] Verify changes work as expected\n- [ ] Run \`bun run typecheck\` and \`bun run lint\`\n`
}
