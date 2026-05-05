import { emptyUsage, type SessionControl } from '@orchentra/cli-core'
import { fetchExecutionGraph, resolveOrchentraConfig } from '@orchentra/cli-api'
import { createGraphCommand, type GraphCommandDeps } from './builtin/graph'
import type { CommandContext } from './registry'
import type { UiOutput } from './ui-output'

export interface RunGraphOptions {
  readonly executionId: string
  readonly cwd: string
  readonly outputFormat?: 'tree' | 'json'
  readonly deps?: GraphCommandDeps
}

/**
 * Verb-path entry for `orchentra graph <executionId>`. Reuses the same
 * handler that powers the REPL `/graph` slash-command. Routes `text`
 * output to stdout, info notes to stdout, and warn notes (the handler's
 * error channel) to stderr so callers can pipe / detect failures.
 */
export async function runGraph(options: RunGraphOptions): Promise<number> {
  if (!options.executionId) {
    process.stderr.write('usage: orchentra graph <executionId>\n')
    return 1
  }

  if (options.outputFormat === 'json') {
    const fetchGraph = options.deps?.fetchGraph ?? fetchExecutionGraph
    const resolveConfig = options.deps?.resolveConfig ?? resolveOrchentraConfig
    try {
      const cfg = resolveConfig({ cwd: options.cwd })
      const result = await fetchGraph({
        serverUrl: cfg.serverUrl,
        orgId: cfg.orgId,
        apiKey: cfg.apiKey,
        executionId: options.executionId,
      })
      process.stdout.write(JSON.stringify({ executionId: result.executionId, nodes: result.nodes }) + '\n')
      return 0
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 1
    }
  }

  let warned = false
  const ui = (out: UiOutput): void => {
    if (out.kind === 'text') {
      process.stdout.write(`${out.text}\n`)
    } else if (out.kind === 'note') {
      if (out.tone === 'warn') {
        process.stderr.write(`${out.text}\n`)
        warned = true
      } else {
        process.stdout.write(`${out.text}\n`)
      }
    }
  }

  const ctx: CommandContext = {
    cwd: options.cwd,
    session: noopSession(),
    ui,
  }

  const handler = createGraphCommand(options.deps)
  await handler.execute([options.executionId], ctx)
  return warned ? 1 : 0
}

function noopSession(): SessionControl {
  return {
    getModel: () => '',
    setModel: (m: string) => m,
    getPermissionMode: () => 'workspace-write',
    getSessionId: () => '',
    getTurns: () => 0,
    getUsage: () => emptyUsage(),
    clearHistory: () => {},
    forceCompact: () => {},
  }
}
