#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'
import { parseArgs, renderHelp } from './args'
import { runRepl } from './repl'
import { initializeRepo } from './init'

async function main(argv: string[]): Promise<number> {
  let action
  try {
    action = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  switch (action.kind) {
    case 'version':
      process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
      return 0

    case 'help':
      process.stdout.write(renderHelp())
      return 0

    case 'init': {
      const report = initializeRepo(process.cwd())
      for (const artifact of report.artifacts) {
        const label = artifact.status === 'created' ? '+' : artifact.status === 'updated' ? '~' : '.'
        process.stdout.write(`  ${label} ${artifact.name} (${artifact.status})\n`)
      }
      return 0
    }

    case 'prompt': {
      const { runRepl: runSingleTurn } = await import('./repl')
      return runSingleTurn({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })
    }

    case 'repl':
      return runRepl({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })

    case 'resume':
      process.stdout.write(`Resuming session: ${action.sessionPath}\n`)
      return 0
  }
}

main(process.argv).then((code) => process.exit(code))
