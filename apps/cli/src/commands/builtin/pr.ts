import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import type { UiOutput } from '../ui-output'
import {
  resolveToken,
  createPullRequest,
  findOpenPullByHead,
  listPullReviewComments,
  GitHubClient,
} from '@orchentra/cli-api'

interface PrRef {
  readonly number: number
  readonly title: string
  readonly html_url: string
}

/** Structured render of a PR's review comments: a summary card plus one row per comment. */
export function reviewCommentsOutputs(pr: PrRef, comments: readonly { body: string; html_url: string }[]): UiOutput[] {
  if (comments.length === 0) {
    return [{ kind: 'note', tone: 'info', text: `No review comments on PR #${pr.number}.` }]
  }
  const outputs: UiOutput[] = [
    {
      kind: 'card',
      title: 'PR review comments',
      subtitle: `#${pr.number} ${pr.title}`,
      sections: [
        {
          rows: [
            { key: 'Comments', value: String(comments.length) },
            { key: 'URL', value: pr.html_url },
          ],
        },
      ],
    },
  ]
  comments.forEach((c, i) => {
    outputs.push({ kind: 'text', text: `${i + 1}. ${c.body.trim()}\n   ${c.html_url}` })
  })
  return outputs
}

export class PrCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'pr',
    aliases: [],
    summary: 'Create or update a pull request',
    argumentHint: '[comments] [--title <t>] [--base <branch>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    if (args[0] === 'comments') return this.showComments(ctx)

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

  private async showComments(ctx: CommandContext): Promise<boolean> {
    const branchResult = Bun.spawnSync(['git', 'branch', '--show-current'], { cwd: ctx.cwd, stdout: 'pipe' })
    const branch = new TextDecoder().decode(branchResult.stdout).trim()
    if (!branch) return note(ctx, 'error: not on a branch', 'warn')

    const remoteResult = Bun.spawnSync(['git', 'remote', 'get-url', 'origin'], { cwd: ctx.cwd, stdout: 'pipe' })
    const remoteUrl = new TextDecoder().decode(remoteResult.stdout).trim()
    const repoInfo = parseGitRemote(remoteUrl)
    if (!repoInfo) return note(ctx, 'error: could not determine owner/repo from git remote', 'warn')

    const token = resolveToken()
    if (!token) return note(ctx, 'error: GitHub token not found. Run `orchentra doctor` to diagnose.', 'warn')

    const client = new GitHubClient({ token: token.token })
    const pr = await findOpenPullByHead(client, repoInfo.owner, repoInfo.repo, branch)
    if (!pr) return note(ctx, `No open PR found for ${branch}.`, 'warn')

    try {
      const comments = await listPullReviewComments(client, repoInfo.owner, repoInfo.repo, pr.number)
      for (const output of reviewCommentsOutputs(pr, comments)) emit(ctx, output)
      return true
    } catch (e) {
      return note(ctx, `error fetching review comments: ${(e as Error).message}`, 'warn')
    }
  }
}

function emit(ctx: CommandContext, output: UiOutput): void {
  if (ctx.ui) {
    ctx.ui(output)
    return
  }
  if (output.kind === 'text' || output.kind === 'note') {
    process.stdout.write(output.text + '\n')
  } else if (output.kind === 'card') {
    const header = [output.title, output.subtitle].filter(Boolean).join(' — ')
    process.stdout.write(header + '\n')
    for (const section of output.sections) {
      for (const row of section.rows) process.stdout.write(`  ${row.key}: ${row.value}\n`)
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
