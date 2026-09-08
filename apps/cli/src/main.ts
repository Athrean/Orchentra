#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'
import { parseArgs, renderHelp } from './args'

async function main(argv: string[]): Promise<number> {
  let action
  try {
    action = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  switch (action.kind) {
    case 'extensions': {
      const { manageExtensions } = await import('./extensions/commands')
      try {
        process.stdout.write((await manageExtensions(action.extensionKind, action.args)) + '\n')
        return 0
      } catch (error) {
        process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
        return 1
      }
    }

    case 'version':
      process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
      return 0

    case 'help':
      process.stdout.write(renderHelp())
      return 0

    case 'init': {
      const { runInit } = await import('./commands/run-init')
      return runInit()
    }

    case 'update': {
      const { runUpdate } = await import('./commands/run-update')
      return runUpdate({ dryRun: action.dryRun, tag: action.tag })
    }

    case 'eval': {
      if (action.abProfiles) {
        const { runEvalProfilesAbCommand } = await import('./commands/run-eval-diff')
        return runEvalProfilesAbCommand({
          corpus: action.corpus,
          id: action.id,
          model: action.model,
          k: action.k,
          out: action.out,
        })
      }
      if (action.against) {
        const { runEvalDiffCommand } = await import('./commands/run-eval-diff')
        return runEvalDiffCommand({
          corpus: action.corpus,
          id: action.id,
          model: action.model,
          k: action.k,
          out: action.out,
          against: action.against,
        })
      }
      const { runEvalCommand } = await import('./commands/run-eval')
      return runEvalCommand({ corpus: action.corpus, id: action.id, model: action.model, k: action.k, out: action.out })
    }

    case 'regressions': {
      const { runRegressionsCommand } = await import('./commands/run-regressions')
      return runRegressionsCommand({
        suite: action.suite,
        id: action.id,
        category: action.category,
        k: action.k,
        out: action.out,
        summary: action.summary,
        listCategories: action.listCategories,
      })
    }

    case 'trace': {
      const { runTraceCommand } = await import('./commands/run-trace')
      return runTraceCommand(action)
    }

    case 'curriculum': {
      const { runCurriculumCommand } = await import('./commands/run-curriculum')
      return runCurriculumCommand({
        seed: action.seed,
        split: action.split,
        executionProfile: action.executionProfile,
        maxOutputTokens: action.maxOutputTokens,
        model: action.model,
        out: action.out,
        list: action.list,
      })
    }

    case 'prompt': {
      const { runRepl } = await import('./repl')
      return runRepl({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
        prompt: action.prompt,
      })
    }

    case 'repl': {
      const { runRepl } = await import('./repl')
      return runRepl({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })
    }

    case 'resume':
      process.stdout.write(`Resuming session: ${action.sessionPath}\n`)
      return 0

    case 'session-replay': {
      const { runSessionReplay } = await import('./commands/session-replay')
      const { getSessionsDirForWorkspace } = await import('./session-config')
      return runSessionReplay({
        idOrLatest: action.idOrLatest,
        rootDir: getSessionsDirForWorkspace(process.cwd()),
      })
    }

    case 'doctor': {
      const { runDoctor } = await import('./commands/doctor')
      return runDoctor()
    }

    case 'mcp': {
      if (action.sub === 'list') {
        const { runMcpList } = await import('./commands/mcp')
        return runMcpList(process.cwd())
      }
      const { runMcpTest } = await import('./commands/mcp')
      return runMcpTest(action.name, process.cwd())
    }

    case 'login': {
      const { createTerminalLoginIo, runLogin } = await import('./commands/run-auth')
      return (await runLogin(action.provider, createTerminalLoginIo(action.apiKey))) ? 0 : 1
    }

    case 'logout': {
      const { runLogout } = await import('./commands/run-auth')
      return runLogout(action.provider)
    }

    case 'reauth': {
      const { runReauth } = await import('./commands/run-reauth')
      return runReauth()
    }

    case 'auth-status': {
      const { runAuthStatus } = await import('./commands/run-auth')
      return runAuthStatus()
    }
  }
}

/**
 * Bun's `process.exit()` drops stdout still queued in the pipe buffer, which
 * silently truncated large piped output (a scoreboard, a trajectory tree, a
 * learning export read through `| jq`) at ~64 KiB with a zero exit code.
 * Setting `exitCode` lets the loop drain first. The unref'd fallback only fires
 * if some other handle is still holding the process open.
 */
main(process.argv).then((code) => {
  process.exitCode = code
  setTimeout(() => process.exit(code), 2000).unref()
})
