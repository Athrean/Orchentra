import { fetchNodeLineage, resolveOrchentraConfig } from '@orchentra/cli-api'
import { createWhyCommand, type WhyCommandDeps } from './builtin/why'
import type { CommandContext } from './registry'
import type { SessionControl } from '@orchentra/cli-core'

export interface RunWhyOptions {
  readonly nodeId: string
  readonly cwd: string
  readonly outputFormat?: 'tree' | 'json'
  readonly fetchLineage?: WhyCommandDeps['fetchLineage']
  readonly resolveConfig?: WhyCommandDeps['resolveConfig']
}

export async function runWhy(options: RunWhyOptions): Promise<number> {
  if (options.outputFormat === 'json') {
    const fetchLineage = options.fetchLineage ?? fetchNodeLineage
    const resolveConfig = options.resolveConfig ?? resolveOrchentraConfig
    try {
      const cfg = resolveConfig({ cwd: options.cwd })
      const lineage = await fetchLineage({
        serverUrl: cfg.serverUrl,
        orgId: cfg.orgId,
        apiKey: cfg.apiKey,
        nodeId: options.nodeId,
      })
      process.stdout.write(
        JSON.stringify({
          node: lineage.node,
          ancestors: lineage.ancestors,
          argsJson: lineage.node.argsJson,
          resultJson: lineage.node.resultJson,
        }) + '\n',
      )
      return 0
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
      return 1
    }
  }

  const deps: Partial<WhyCommandDeps> = {}
  if (options.fetchLineage) deps.fetchLineage = options.fetchLineage
  if (options.resolveConfig) deps.resolveConfig = options.resolveConfig
  const handler =
    deps.fetchLineage && deps.resolveConfig ? createWhyCommand(deps as WhyCommandDeps) : createWhyCommand()

  const ctx: CommandContext = {
    cwd: options.cwd,
    session: noopSession(),
  }

  let exitCode = 0
  const origStderr = process.stderr.write.bind(process.stderr)
  // The why handler routes errors through `emitNote(warn)` to stdout when no
  // ui sink is wired. For the verb path we want errors on stderr with a
  // non-zero exit. Wrap by intercepting warn-tone notes via a ui sink.
  ctx.ui = (output) => {
    if (output.kind === 'note' && output.tone === 'warn') {
      origStderr(`error: ${output.text.replace(/^error:\s*/, '')}\n`)
      exitCode = 1
      return
    }
    if (output.kind === 'text') {
      process.stdout.write(output.text + '\n')
      return
    }
    if (output.kind === 'note') {
      process.stdout.write(output.text + '\n')
    }
  }

  await handler.execute([options.nodeId], ctx)
  return exitCode
}

function noopSession(): SessionControl {
  return {
    getModel: () => '',
    setModel: (m: string) => m,
    getPermissionMode: () => 'workspace-write',
    getSessionId: () => '',
    getTurns: () => 0,
    getUsage: () => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }),
    clearHistory: () => {},
    forceCompact: () => {},
  }
}
