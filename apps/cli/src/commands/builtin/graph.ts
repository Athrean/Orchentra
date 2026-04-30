import { fetchExecutionGraph, GraphHttpError, resolveOrchentraConfig, type GraphNodeDto } from '@orchentra/cli-api'
import { formatGraphTree, type GraphNode } from '@orchentra/cli-core'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

export interface GraphCommandDeps {
  fetchGraph: (opts: {
    serverUrl: string
    orgId: string
    apiKey: string
    executionId: string
  }) => Promise<{ executionId: string; nodes: readonly GraphNodeDto[] }>
  resolveConfig: (opts: { cwd: string }) => { serverUrl: string; orgId: string; apiKey: string }
}

const defaultDeps: GraphCommandDeps = {
  fetchGraph: fetchExecutionGraph,
  resolveConfig: resolveOrchentraConfig,
}

export function createGraphCommand(deps: GraphCommandDeps = defaultDeps): CommandHandler {
  const spec: SlashCommandSpec = {
    name: 'graph',
    aliases: [],
    summary: 'Render the execution graph as an ASCII tree',
    argumentHint: '<executionId>',
  }
  return {
    spec,
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      const executionId = args[0]
      if (!executionId) {
        emitNote(ctx, 'warn', 'usage: /graph <executionId>')
        return true
      }

      try {
        const cfg = deps.resolveConfig({ cwd: ctx.cwd })
        const result = await deps.fetchGraph({
          serverUrl: cfg.serverUrl,
          orgId: cfg.orgId,
          apiKey: cfg.apiKey,
          executionId,
        })
        if (result.nodes.length === 0) {
          emitNote(ctx, 'info', `execution ${executionId} has no nodes yet`)
          return true
        }
        const tree = formatGraphTree(result.nodes.map(toCoreNode))
        emitText(ctx, `execution ${result.executionId}\n${tree}`)
      } catch (err) {
        emitNote(ctx, 'warn', `error: ${describe(err)}`)
      }
      return true
    },
  }
}

function toCoreNode(dto: GraphNodeDto): GraphNode {
  return {
    id: dto.id,
    parentNodeId: dto.parentNodeId,
    kind: dto.kind,
    integration: dto.integration,
    round: dto.round,
    durationMs: dto.durationMs,
    createdAt: dto.createdAt,
  }
}

function emitText(ctx: CommandContext, text: string): void {
  if (ctx.ui) ctx.ui({ kind: 'text', text })
  else process.stdout.write(text + '\n')
}

function emitNote(ctx: CommandContext, tone: 'info' | 'warn', text: string): void {
  if (ctx.ui) ctx.ui({ kind: 'note', tone, text })
  else process.stdout.write(text + '\n')
}

function describe(err: unknown): string {
  if (err instanceof GraphHttpError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
