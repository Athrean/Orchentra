import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import type { PermissionMode } from '@orchentra/cli-core'
import { loadSkills } from '@orchentra/cli-core'
import { tryLoadKeytar } from '@orchentra/cli-api'
import { CLI_NAME, CLI_VERSION } from './version'
import { createCliContext } from './live-cli-factory'
import { registry } from './commands'
import {
  registerSkillCommands,
  recordLoadErrors,
  recordSkillsReloadCallback,
  getLoadedSkills,
} from './commands/builtin/skills-adapter'
import { isFirstRun, markWelcomed } from './render/first-run'
import { runOneShot } from './one-shot'
import { runTui } from './tui'
import { hasAnyLlmCredential } from './auth/credential-check'
import { runFirstRunFlow, makeDefaultFirstRunDeps } from './auth/first-run-flow'

export interface ReplOptions {
  model: string
  permissionMode: PermissionMode
  cwd: string
  prompt?: string
}

export async function runRepl(options: ReplOptions): Promise<number> {
  const shim = await tryLoadKeytar()
  if (!(await hasAnyLlmCredential(homedir(), shim))) {
    const result = await runFirstRunFlow(makeDefaultFirstRunDeps(undefined, shim, { cwd: options.cwd }))
    if (result.kind === 'cancelled') {
      process.stderr.write(
        'orchentra needs at least one LLM provider configured. Run `orchentra reauth` to try again.\n',
      )
      return 1
    }
    // Clear the first-run overlay before the regular banner renders so the
    // user does not see two stacked welcome cards (the bordered first-run
    // card in scrollback + the post-mount banner). The TUI re-anchors the
    // banner inside its own static region from this point on.
    process.stdout.write('\x1b[2J\x1b[H')
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
    return runOneShot(cli, options.prompt, () => cliCtx.close())
  }

  const { branch, workspaceStatus } = readGitSummary(options.cwd)

  if (isFirstRun()) {
    markWelcomed()
  }

  await runTui({
    cli,
    registry,
    cwd: options.cwd,
    model: resolvedModel,
    mode: resolvedMode,
    branch,
    banner: {
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
      username: process.env.USER,
    },
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
