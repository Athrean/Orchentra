#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'
import { parseArgs, renderHelp } from './args'
import { runRepl } from './repl'
import { initializeRepo } from './init'
import { runInvestigate } from './commands/run-investigate'

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

    case 'prompt':
      return runRepl({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
        prompt: action.prompt,
      })

    case 'repl':
      return runRepl({
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })

    case 'resume':
      process.stdout.write(`Resuming session: ${action.sessionPath}\n`)
      return 0

    case 'investigate':
      return runInvestigate({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })

    case 'triage':
      process.stderr.write('triage: not implemented yet\n')
      return 1

    case 'fix':
      process.stderr.write('fix: not implemented yet\n')
      return 1
  }
}

main(process.argv).then((code) => process.exit(code))
