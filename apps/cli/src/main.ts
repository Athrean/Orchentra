#!/usr/bin/env bun
import { CLI_NAME, CLI_VERSION } from './version'
import { parseArgs, renderHelp } from './args'
import { runRepl } from './repl'
import { initializeRepo } from './init'
import { runInvestigate } from './commands/run-investigate'
import { runTriage } from './commands/run-triage'
import { runFix } from './commands/run-fix'
import { runSessionReplay } from './commands/session-replay'
import { runDoctor } from './commands/doctor'
import { runWatch } from './commands/watch'
import { runMcpList, runMcpTest } from './commands/mcp'
import { runMcpServe } from './commands/mcp-serve'
import { runLogin, runLogout, runAuthStatus } from './commands/run-auth'
import { runReauth } from './commands/run-reauth'
import { runGraph } from './commands/run-graph'
import { runWhy } from './commands/run-why'
import { runOpVerb } from './op-commands/run-op-verb'

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
      return runTriage({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })

    case 'fix':
      return runFix({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
        title: action.title,
        base: action.base,
        autoMerge: action.autoMerge,
      })

    case 'session-replay':
      return runSessionReplay({ idOrLatest: action.idOrLatest })

    case 'doctor':
      return runDoctor()

    case 'watch':
      return runWatch({ repo: action.repo, intervalMs: action.intervalMs })

    case 'mcp':
      if (action.sub === 'list') return runMcpList(process.cwd())
      if (action.sub === 'serve') return runMcpServe({ printToolsJson: action.printToolsJson })
      return runMcpTest(action.name, process.cwd())

    case 'login':
      return runLogin(action.provider, action.apiKey)

    case 'logout':
      return runLogout(action.provider)

    case 'reauth':
      return runReauth()

    case 'auth-status':
      return runAuthStatus()

    case 'graph':
      return runGraph({
        executionId: action.executionId,
        cwd: process.cwd(),
        outputFormat: action.outputFormat,
      })

    case 'why':
      return runWhy({
        nodeId: action.nodeId,
        cwd: process.cwd(),
        outputFormat: action.outputFormat,
      })

    case 'op':
      return runOpVerb(action.opId, action.argv)
  }
}

main(process.argv).then((code) => process.exit(code))
