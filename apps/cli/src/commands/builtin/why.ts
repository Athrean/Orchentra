import { fetchNodeLineage, GraphHttpError, resolveOrchentraConfig, type GraphNodeDto } from '@orchentra/cli-api'
import { formatNodeLineage, type GraphNode } from '@orchentra/cli-core'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

export interface WhyCommandDeps {
  fetchLineage: (opts: {
    serverUrl: string
    orgId: string
    apiKey: string
    nodeId: string
  }) => Promise<{ node: GraphNodeDto; ancestors: readonly GraphNodeDto[] }>
  resolveConfig: (opts: { cwd: string }) => { serverUrl: string; orgId: string; apiKey: string }
}

const defaultDeps: WhyCommandDeps = {
  fetchLineage: fetchNodeLineage,
  resolveConfig: resolveOrchentraConfig,
}

export function createWhyCommand(deps: WhyCommandDeps = defaultDeps): CommandHandler {
  const spec: SlashCommandSpec = {
    name: 'why',
    aliases: [],
    summary: 'Trace why a node ran — ancestors + inputs + outcome',
    argumentHint: '<nodeId>',
  }
  return {
    spec,
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      const nodeId = args[0]
      if (!nodeId) {
        emitNote(ctx, 'warn', 'usage: /why <nodeId>')
        return true
      }

      try {
        const cfg = deps.resolveConfig({ cwd: ctx.cwd })
        const lineage = await deps.fetchLineage({
          serverUrl: cfg.serverUrl,
          orgId: cfg.orgId,
          apiKey: cfg.apiKey,
          nodeId,
        })
        const text = formatNodeLineage({
          node: toCoreNode(lineage.node),
          ancestors: lineage.ancestors.map(toCoreNode),
          argsJson: lineage.node.argsJson,
          resultJson: lineage.node.resultJson,
        })
        emitText(ctx, text)
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
