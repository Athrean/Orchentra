import { resolveToken } from '@orchentra/cli-api'
import { initializeRepo, type InitReport } from '../../init'
import { createNonInteractiveLoginIo, createTerminalLoginIo, runLogin, type LoginIo } from '../run-auth'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

export interface InitSlashDeps {
  readonly initialize?: (cwd: string) => InitReport
  readonly hasGitHubToken?: () => boolean
  readonly login?: (provider: string, io: LoginIo) => Promise<boolean>
}

export class InitSlashCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'init',
    aliases: [],
    summary: 'Initialize local repo config and connect GitHub',
  }

  constructor(private readonly deps: InitSlashDeps = {}) {}

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    if (args.length > 0) return emit(ctx, `Usage: /init — unknown argument: ${args[0]}`, 'warn', false)

    const report = (this.deps.initialize ?? initializeRepo)(ctx.cwd)
    const hasGitHubToken = this.deps.hasGitHubToken ?? (() => resolveToken() !== null)
    const connected = hasGitHubToken()
    const rows = [
      ...report.artifacts.map((artifact) => ({ key: artifact.name, value: artifact.status })),
      { key: 'GitHub', value: connected ? 'connected' : 'device login required' },
    ]

    if (ctx.ui) {
      ctx.ui({ kind: 'card', title: 'Initialized', subtitle: report.projectRoot, sections: [{ rows }] })
    } else {
      process.stdout.write(`Initialized ${report.projectRoot}\n`)
      for (const row of rows) process.stdout.write(`  ${row.key}  ${row.value}\n`)
    }

    if (connected) return true
    const login = this.deps.login ?? runLogin
    return login('github', loginIo(ctx))
  }
}

function loginIo(ctx: CommandContext): LoginIo {
  if (!ctx.ui) return createTerminalLoginIo()
  return createNonInteractiveLoginIo({
    out: (message) => ctx.ui?.({ kind: 'note', tone: 'info', text: message }),
    error: (message) => ctx.ui?.({ kind: 'note', tone: 'warn', text: message }),
  })
}

function emit(ctx: CommandContext, text: string, tone: 'info' | 'warn', result: boolean): boolean {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else (tone === 'warn' ? process.stderr : process.stdout).write(`${text}\n`)
  return result
}
