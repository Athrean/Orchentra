#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'

function main(argv: string[]): number {
  const [, , ...args] = argv
  const first = args[0]

  if (first === '--version' || first === '-V' || first === 'version') {
    process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
    return 0
  }

  process.stdout.write(`${CLI_NAME} ${CLI_VERSION} — scaffolding phase. Commands land in phase 4.\n`)
  return 0
}

process.exit(main(process.argv))
