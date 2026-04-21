import type { PermissionMode } from '@orchentra/cli-core'
import { CLI_NAME, CLI_VERSION } from './version'
import { readLine } from './input'
import { createCliContext } from './live-cli-factory'
import { parseSlashCommand, dispatchCommand, renderCommandHelp } from './commands'
import type { CommandContext } from './commands'

export interface ReplOptions {
  model: string
  permissionMode: PermissionMode
  cwd: string
  prompt?: string
}

export async function runRepl(options: ReplOptions): Promise<number> {
  const ctx = await createCliContext({
    model: options.model,
    permissionMode: options.permissionMode,
    cwd: options.cwd,
  })
  const { cli, sessionId, resolvedModel, resolvedPermissionMode: resolvedMode } = ctx

  if (options.prompt) {
    await cli.runTurn(options.prompt)
    await ctx.close()
    return 0
  }

  process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
  process.stdout.write(`Model: ${resolvedModel} | Mode: ${resolvedMode}\n`)
  process.stdout.write(`Session: ${sessionId}\n\n`)
  process.stdout.write(renderCommandHelp() + '\n\n')

  let running = true
  while (running) {
    const outcome = await readLine('> ')
    switch (outcome.type) {
      case 'exit':
        running = false
        break
      case 'cancel':
        break
      case 'submit': {
        const trimmed = outcome.text.trim()
        if (trimmed.length === 0) break

        const slash = parseSlashCommand(trimmed)
        if (slash === null) {
          await cli.runTurn(trimmed)
          break
        }
        if (slash instanceof Error) {
          process.stdout.write(`${slash.message}\n`)
          break
        }

        if (slash.kind === 'exit') {
          running = false
          break
        }

        const ctx: CommandContext = {
          model: cli.currentModel,
          permissionMode: cli.currentPermissionMode,
          sessionId,
          turns: cli.turns,
          cwd: options.cwd,
        }
        const shouldContinue = await dispatchCommand(slash, ctx)
        if (slash.kind === 'clear') {
          cli.clearHistory()
        }
        if (!shouldContinue) {
          running = false
        }
        break
      }
    }

    process.stdout.write('\n')
  }

  await ctx.close()
  return 0
}
