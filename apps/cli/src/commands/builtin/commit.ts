import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

export class CommitCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'commit',
    aliases: [],
    summary: 'Stage changes and commit with AI-generated message',
    argumentHint: '[--message <msg>]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const explicitMsg = extractFlag(args, '--message') ?? extractFlag(args, '-m')

    // Check if there are changes to commit
    const statusResult = Bun.spawnSync(['git', 'status', '--porcelain'], {
      cwd: ctx.cwd,
      stdout: 'pipe',
    })
    const statusOut = new TextDecoder().decode(statusResult.stdout).trim()
    if (!statusOut) {
      process.stdout.write('No changes to commit.\n')
      return true
    }

    // Stage all changes
    Bun.spawnSync(['git', 'add', '-A'], { cwd: ctx.cwd })

    // Get the diff for message generation
    const diffResult = Bun.spawnSync(['git', 'diff', '--cached', '--stat'], {
      cwd: ctx.cwd,
      stdout: 'pipe',
    })
    const diffStat = new TextDecoder().decode(diffResult.stdout).trim()

    let message: string
    if (explicitMsg) {
      message = explicitMsg
    } else {
      // Generate commit message from diff
      const branchResult = Bun.spawnSync(['git', 'branch', '--show-current'], {
        cwd: ctx.cwd,
        stdout: 'pipe',
      })
      const branch = new TextDecoder().decode(branchResult.stdout).trim()
      message = generateCommitMessage(diffStat, branch)
    }

    // Commit
    const commitResult = Bun.spawnSync(['git', 'commit', '-m', message], {
      cwd: ctx.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const commitOut = new TextDecoder().decode(commitResult.stdout).trim()
    const commitErr = new TextDecoder().decode(commitResult.stderr).trim()

    if (commitResult.exitCode !== 0) {
      process.stdout.write(`Commit failed: ${commitErr || commitOut}\n`)
      return true
    }

    process.stdout.write(`${commitOut || commitErr}\n`)
    process.stdout.write(`Message: ${message}\n`)
    return true
  }
}

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

function generateCommitMessage(diffStat: string, branch: string): string {
  const files = diffStat.split('\n').filter((l) => l.trim())
  const fileCount = Math.max(files.length - 1, 0)
  const lastLine = files[files.length - 1] ?? ''
  const match = lastLine.match(/(\d+) files? changed/)

  if (branch.startsWith('feat/')) {
    return `feat(${branch.slice(5)}): update ${match ? match[1] : fileCount} file${match?.[1] !== '1' ? 's' : ''}`
  }
  if (branch.startsWith('fix/')) {
    return `fix(${branch.slice(4)}): update ${match ? match[1] : fileCount} file${match?.[1] !== '1' ? 's' : ''}`
  }
  return `chore: update ${match ? match[1] : fileCount} file${match?.[1] !== '1' ? 's' : ''}`
}
