import { spawnSync } from 'node:child_process'
import type { PermissionMode } from '@orchentra/cli-core'
import { CLI_NAME, CLI_VERSION } from './version'
import { readLine } from './input'
import { createCliContext } from './live-cli-factory'
import { parseSlashCommand, dispatchCommand } from './commands'
import type { CommandContext } from './commands'
import { renderWelcomeBanner } from './render/banner'

export interface ReplOptions {
  model: string
  permissionMode: PermissionMode
  cwd: string
  prompt?: string
}

export async function runRepl(options: ReplOptions): Promise<number> {
  const cliCtx = await createCliContext({
    model: options.model,
    permissionMode: options.permissionMode,
    cwd: options.cwd,
  })
  const { cli, resolvedModel, resolvedPermissionMode: resolvedMode, sessionId, sessionPath, providerName } = cliCtx

  if (options.prompt) {
    await cli.runTurn(options.prompt)
    await cliCtx.close()
    return 0
  }

  const { branch, workspaceStatus } = readGitSummary(options.cwd)
  process.stdout.write(
    renderWelcomeBanner({
      cliName: CLI_NAME,
      cliVersion: CLI_VERSION,
      model: resolvedModel,
      permissionMode: resolvedMode,
      cwd: options.cwd,
      branch,
      workspaceStatus,
      sessionId,
      sessionPath,
      providerName,
    }),
  )
  process.stdout.write('\n')

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

        const resolved = parseSlashCommand(trimmed)
        if (resolved === null) {
          await cli.runTurn(trimmed)
          break
        }
        if (resolved instanceof Error) {
          process.stdout.write(`${resolved.message}\n`)
          break
        }

        const cmdCtx: CommandContext = {
          cwd: options.cwd,
          session: cli,
        }
        const shouldContinue = await dispatchCommand(resolved, cmdCtx)
        if (!shouldContinue) {
          running = false
        }
        break
      }
    }

    process.stdout.write('\n')
  }

  await cliCtx.close()
  return 0
}

interface GitSummary {
  readonly branch: string
  readonly workspaceStatus: string
}

function readGitSummary(cwd: string): GitSummary {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) ?? 'unknown'
  const porcelain = runGit(['status', '--porcelain'], cwd)
  if (porcelain === null) return { branch, workspaceStatus: 'unknown' }
  if (porcelain.length === 0) return { branch, workspaceStatus: 'clean' }
  const lines = porcelain.split('\n').length
  return { branch, workspaceStatus: `${lines} change${lines === 1 ? '' : 's'}` }
}

function runGit(args: string[], cwd: string): string | null {
  try {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 500 })
    if (result.status !== 0) return null
    return result.stdout.trim()
  } catch {
    return null
  }
}
