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
      process.stdout.write(
        `error: current branch "${branch}" is not a valid PR branch (must differ from base "${base}")\n`,
      )
      return true
    }

    // Detect remote repo
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

    // Push current branch
    process.stdout.write(`Pushing ${branch}...\n`)
    Bun.spawnSync(['git', 'push', '-u', 'origin', branch], { cwd: ctx.cwd })

    // Create PR
    const token = resolveToken()
    if (!token) {
      process.stdout.write('error: GitHub token not found. Run `orchentra doctor` to diagnose.\n')
      return true
    }

    const client = new GitHubClient({ token: token.token })
    const prTitle = title ?? generatePrTitle(branch)
    const body = generatePrBody(branch)

    // Check for existing PR
    const existing = await findOpenPullByHead(client, repoInfo.owner, repoInfo.repo, branch)
    if (existing) {
      process.stdout.write(`PR already exists: ${existing.html_url}\n`)
      return true
    }

    try {
      const pr = await createPullRequest(client, repoInfo.owner, repoInfo.repo, {
        title: prTitle,
        head: branch,
        base,
        body,
      })
      process.stdout.write(`PR created: ${pr.html_url}\n`)
    } catch (e) {
      process.stdout.write(`error creating PR: ${(e as Error).message}\n`)
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
