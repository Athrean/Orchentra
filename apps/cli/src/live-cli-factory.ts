import { randomUUID } from 'node:crypto'
import {
  ConfigLoader,
  InMemoryTaskStore,
  SessionWriter,
  isKnownModel,
  type PermissionMode,
  type Provider,
  type SharedToolState,
  type ToolRegistry,
} from '@orchentra/cli-core'
import { getSessionsDirForWorkspace } from './session-config'
import { DefaultToolRegistry, BUILTIN_TOOLS, McpManager } from '@orchentra/cli-tools'
import { LiveCli } from './live-cli'
import { CliCoreHookAdapter } from './hooks/cli-core-adapter'
import { builtinModelAliases, createProvider, resolveModelAlias } from './provider-factory'

export interface ResolvedModel {
  readonly model: string
  readonly provider: Provider
  readonly providerName: string
}

export type ModelResolver = (raw: string) => ResolvedModel

export interface CliContextOptions {
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
}

export interface CliContext {
  readonly cli: LiveCli
  readonly sessionId: string
  readonly sessionPath: string
  readonly resolvedModel: string
  readonly resolvedPermissionMode: PermissionMode
  readonly providerName: string
  close(): Promise<void>
}

export async function createCliContext(options: CliContextOptions): Promise<CliContext> {
  const config = ConfigLoader.defaultFor(options.cwd).load()
  const userAliases = config.featureConfig.aliases as Record<string, string> | undefined
  const resolveModel: ModelResolver = (raw: string) => {
    const model = resolveModelAlias(raw, userAliases)
    if (!isKnownModel(model)) {
      process.stderr.write(
        `[orchentra] warn: model '${model}' is not in the known-model list. Provider will still try to call it, but typos here usually surface as opaque API errors. Aliases: ${builtinModelAliases().join(', ')}.\n`,
      )
    }
    return { model, ...createProvider(model) }
  }

  const rawModel = config.featureConfig.model ?? options.model
  const initial = resolveModel(rawModel)
  const resolvedPermissionMode = config.featureConfig.permissionMode ?? options.permissionMode

  const tools = buildToolRegistry()
  const rawMcp = (config.merged as Record<string, unknown>).mcp
  const mcpManager = McpManager.fromRaw(rawMcp, {
    onLog: (level, message) => {
      if (level !== 'info') process.stderr.write(`[mcp] ${level}: ${message}\n`)
    },
  })
  await mcpManager.connectAll()
  mcpManager.registerInto(tools)
  const sessionId = randomUUID()

  const sharedState: SharedToolState = {
    taskStore: new InMemoryTaskStore(),
    todos: [],
    agentCounter: 0,
    planMode: false,
  }

  const hookRunner = new CliCoreHookAdapter(options.cwd)

  const cli = new LiveCli({
    model: initial.model,
    permissionMode: resolvedPermissionMode,
    provider: initial.provider,
    resolveModel,
    tools,
    cwd: options.cwd,
    sessionId,
    sharedState,
    effort: config.featureConfig.effort,
    memoryConfig: config.featureConfig.memory,
    budgetConfig: config.featureConfig.budget,
    hookRunner,
  })

  const session = await SessionWriter.open({
    rootDir: getSessionsDirForWorkspace(options.cwd),
    id: sessionId,
    meta: { cwd: options.cwd, model: initial.model },
  })
  cli.setSession(session)

  return {
    cli,
    sessionId,
    sessionPath: session.path,
    resolvedModel: initial.model,
    resolvedPermissionMode,
    providerName: initial.providerName,
    async close(): Promise<void> {
      await cli.persistSession()
      await mcpManager.shutdown()
    },
  }
}

function buildToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry()
  for (const tool of BUILTIN_TOOLS) registry.register(tool)
  return registry
}
