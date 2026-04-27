import { spawn } from 'node:child_process'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

export interface RestartDeps {
  exec: (execPath: string, argv: string[]) => void
}

const DEFAULT_EXEC: RestartDeps['exec'] = (execPath, argv) => {
  const child = spawn(execPath, argv, { stdio: 'inherit', detached: false })
  child.on('exit', (code) => process.exit(code ?? 0))
}

export class RestartCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'restart',
    aliases: [],
    summary: 'Re-exec the CLI to pick up code or config changes',
  }

  private readonly deps: RestartDeps

  constructor(deps: RestartDeps = { exec: DEFAULT_EXEC }) {
    this.deps = deps
  }

  async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
    const execPath = process.execPath
    const argv = process.argv.slice(1)
    process.stdout.write('Restarting Orchentra...\n')
    this.deps.exec(execPath, argv)
    return true
  }
}
