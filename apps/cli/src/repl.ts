import { spawnSync } from 'node:child_process'
import type { PermissionMode } from '@orchentra/cli-core'
import { loadSkills } from '@orchentra/cli-core'
import { CLI_NAME, CLI_VERSION } from './version'
import { createCliContext } from './live-cli-factory'
import { registry } from './commands'
import { registerSkillCommands } from './commands/builtin/skills-adapter'
import { printWelcomeBanner } from './render/banner'
import { runTui } from './tui'

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

  const { skills, errors: skillErrors } = await loadSkills({ workspaceRoot: options.cwd })
  registerSkillCommands(registry, skills, {
    runTurn: async (text) => {
      await cli.runTurn(text)
    },
  })
  for (const err of skillErrors) {
    process.stderr.write(`[orchentra] skill '${err.path}' invalid: ${err.message}\n`)
  }

  if (options.prompt) {
    await cli.runTurn(options.prompt)
    await cliCtx.close()
    return 0
  }

  const { branch, workspaceStatus } = readGitSummary(options.cwd)
  await printWelcomeBanner({
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
  })
  process.stdout.write('\n')

  await runTui({
    cli,
    registry,
    cwd: options.cwd,
    model: resolvedModel,
    mode: resolvedMode,
    branch,
  })

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
