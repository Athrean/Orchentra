#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'
import { parseArgs, renderHelp } from './args'

function main(argv: string[]): number {
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
    case 'init':
      process.stdout.write(`Initializing project config...\n`)
      // init logic wired in 4G
      return 0
    case 'prompt':
      process.stdout.write(`Prompt: ${action.prompt}\n`)
      process.stdout.write(`Model: ${action.model}\n`)
      // prompt execution wired in 4I
      return 0
    case 'repl':
      process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
      process.stdout.write(`Model: ${action.model} | Mode: ${action.permissionMode}\n`)
      // REPL wired in 4F
      return 0
    case 'resume':
      process.stdout.write(`Resuming session: ${action.sessionPath}\n`)
      // resume wired in 4I
      return 0
  }
}

process.exit(main(process.argv))
