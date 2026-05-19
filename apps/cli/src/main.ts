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
    case 'version':
      process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
      return 0

    case 'help':
      process.stdout.write(renderHelp())
      return 0

    case 'init': {
      const { runInitBootstrap } = await import('./commands/run-init')
      return runInitBootstrap({ owner: action.owner, serverUrl: action.serverUrl })
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

    case 'investigate': {
      const { runInvestigate } = await import('./commands/run-investigate')
      return runInvestigate({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })
    }

    case 'triage': {
      const { runTriage } = await import('./commands/run-triage')
      return runTriage({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
      })
    }

    case 'fix': {
      const { runFix } = await import('./commands/run-fix')
      return runFix({
        spec: action.spec,
        model: action.model,
        permissionMode: action.permissionMode,
        cwd: process.cwd(),
        title: action.title,
        base: action.base,
        autoMerge: action.autoMerge,
      })
    }

    case 'session-replay': {
      const { runSessionReplay } = await import('./commands/session-replay')
      return runSessionReplay({ idOrLatest: action.idOrLatest })
    }

    case 'doctor': {
      const { runDoctor } = await import('./commands/doctor')
      return runDoctor()
    }

    case 'watch': {
      const { runWatch } = await import('./commands/watch')
      return runWatch({ repo: action.repo, intervalMs: action.intervalMs })
    }

    case 'mcp': {
      if (action.sub === 'list') {
        const { runMcpList } = await import('./commands/mcp')
        return runMcpList(process.cwd())
      }
      if (action.sub === 'serve') {
        const { runMcpServe } = await import('./commands/mcp-serve')
        return runMcpServe({ printToolsJson: action.printToolsJson })
      }
      const { runMcpTest } = await import('./commands/mcp')
      return runMcpTest(action.name, process.cwd())
    }

    case 'login': {
      const { runLogin } = await import('./commands/run-auth')
      return runLogin(action.provider, action.apiKey)
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

    case 'graph': {
      const { runGraph } = await import('./commands/run-graph')
      return runGraph({
        executionId: action.executionId,
        cwd: process.cwd(),
        outputFormat: action.outputFormat,
      })
    }

    case 'why': {
      const { runWhy } = await import('./commands/run-why')
      return runWhy({
        nodeId: action.nodeId,
        cwd: process.cwd(),
        outputFormat: action.outputFormat,
      })
    }

    case 'op': {
      const { runOpVerb } = await import('./op-commands/run-op-verb')
      return runOpVerb(action.opId, action.argv)
    }
  }
}

main(process.argv).then((code) => process.exit(code))
