import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { gitCommandEnv, runProcessSync } from '@orchentra/cli-core'

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
    const statusOut = runProcessSync(['git', 'status', '--porcelain'], {
      cwd: ctx.cwd,
      env: gitCommandEnv(),
    }).stdout.trim()
    if (!statusOut) {
      return note(ctx, 'No changes to commit.')
    }

    // Stage all changes
    runProcessSync(['git', 'add', '-A'], { cwd: ctx.cwd, env: gitCommandEnv() })

    // Get the diff for message generation
    const diffStat = runProcessSync(['git', 'diff', '--cached', '--stat'], {
      cwd: ctx.cwd,
      env: gitCommandEnv(),
    }).stdout.trim()

    let message: string
    if (explicitMsg) {
      message = explicitMsg
    } else {
      // Generate commit message from diff
      const branch = runProcessSync(['git', 'branch', '--show-current'], {
        cwd: ctx.cwd,
        env: gitCommandEnv(),
      }).stdout.trim()
      message = generateCommitMessage(diffStat, branch)
    }

    // Commit
    const commitResult = runProcessSync(['git', 'commit', '-m', message], { cwd: ctx.cwd, env: gitCommandEnv() })
    const commitOut = commitResult.stdout.trim()
    const commitErr = commitResult.stderr.trim()

    if (commitResult.exitCode !== 0) {
      return note(ctx, `Commit failed: ${commitErr || commitOut}`, 'warn')
    }

    if (ctx.ui) {
      ctx.ui({
        kind: 'card',
        title: 'Commit',
        sections: [
          {
            rows: [
              { key: 'Result', value: (commitOut || commitErr).split('\n')[0] ?? '' },
              { key: 'Message', value: message },
            ],
          },
        ],
      })
    } else {
      process.stdout.write(`${commitOut || commitErr}\n`)
      process.stdout.write(`Message: ${message}\n`)
    }
    return true
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
