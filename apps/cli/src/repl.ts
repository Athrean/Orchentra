import { spawnSync } from 'node:child_process'
import type { PermissionMode } from '@orchentra/cli-core'
import { loadSkills } from '@orchentra/cli-core'
import { gateTrust } from './trust/prompt-trust'
import { CLI_NAME, CLI_VERSION } from './version'
import { createCliContext } from './live-cli-factory'
import { registry } from './commands'
import {
  registerSkillCommands,
  recordLoadErrors,
  recordSkillsReloadCallback,
  getLoadedSkills,
} from './commands/builtin/skills-adapter'
import { printWelcomeBanner } from './render/banner'
import { printWelcomeTips } from './render/welcome-tips'
import { isFirstRun, markWelcomed } from './render/first-run'
import { runTui } from './tui'

export interface ReplOptions {
  model: string
  permissionMode: PermissionMode
  cwd: string
  prompt?: string
}

export async function runRepl(options: ReplOptions): Promise<number> {
  if (shouldGateTrust(options.permissionMode)) {
    const verdict = await gateTrust({ cwd: options.cwd })
    if (verdict === 'denied') {
      process.stderr.write(`[orchentra] trust denied for ${options.cwd}; not starting.\n`)
      return 1
    }
    if (verdict === 'cancelled') {
      process.stderr.write(`[orchentra] trust prompt cancelled.\n`)
      return 1
    }
  }

  const cliCtx = await createCliContext({
    model: options.model,
    permissionMode: options.permissionMode,
    cwd: options.cwd,
  })
  const { cli, resolvedModel, resolvedPermissionMode: resolvedMode, sessionId, sessionPath, providerName } = cliCtx

  const skillLoadOptions = {
    workspaceRoot: options.cwd,
    configHome: process.env.ORCHENTRA_CONFIG_HOME ?? (process.env.HOME ? `${process.env.HOME}/.orchentra` : undefined),
  }
  const runTurnDep = {
    runTurn: async (text: string): Promise<void> => {
      await cli.runTurn(text)
    },
  }

  const { skills, errors: skillErrors } = await loadSkills(skillLoadOptions)
  registerSkillCommands(registry, skills, runTurnDep)
  recordLoadErrors(skillErrors)
  for (const err of skillErrors) {
    process.stderr.write(`[orchentra] skill '${err.path}' invalid: ${err.message}\n`)
  }

  recordSkillsReloadCallback(async () => {
    const before = new Set(getLoadedSkills().map((s) => s.name))
    const fresh = await loadSkills(skillLoadOptions)
    registerSkillCommands(registry, fresh.skills, runTurnDep)
    recordLoadErrors(fresh.errors)
    const after = new Set(fresh.skills.map((s) => s.name))
    let added = 0
    let removed = 0
    for (const name of Array.from(after)) if (!before.has(name)) added++
    for (const name of Array.from(before)) if (!after.has(name)) removed++
    return { added, removed, errors: fresh.errors.length }
  })

  for (const notice of cli.consumeStartupNotices()) {
    process.stderr.write(`${notice}\n`)
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

  if (isFirstRun()) {
    await printWelcomeTips({ cliName: CLI_NAME, username: process.env.USER })
    process.stdout.write('\n')
    markWelcomed()
  }

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

function shouldGateTrust(mode: PermissionMode): boolean {
  if (mode === 'danger-full-access') return false
  if (process.env.ORCHENTRA_TRUST_BYPASS === '1') return false
  if (!process.stdin.isTTY) return false
  return true
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
