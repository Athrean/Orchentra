import { randomUUID } from 'node:crypto'
import {
  ConfigLoader,
  InMemoryTaskStore,
  ProcessSupervisor,
  SessionWriter,
  activeProfileMode,
  defaultEstimator,
  isKnownModel,
  profileFor,
  type PermissionMode,
  type Provider,
  type SharedToolState,
} from '@orchentra/cli-core'
import { getActiveTerseMode, getSessionsDirForWorkspace } from './session-config'
import { BrowserSessionManager } from '@orchentra/cli-browser'
import { DefaultToolRegistry, McpManager, DEFAULT_MCP_DEFER_TOKENS, applyModelProfile } from '@orchentra/cli-tools'
import { LiveCli } from './live-cli'
import { CliCoreHookAdapter } from './hooks/cli-core-adapter'
import type { HookProgressUpdate } from './hooks/types'
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
  const tools = buildToolRegistry()
  const resolveModel: ModelResolver = (raw: string) => {
    const model = resolveModelAlias(raw, userAliases)
    if (!isKnownModel(model)) {
      process.stderr.write(
        `[orchentra] warn: model '${model}' is not in the known-model list. Provider will still try to call it, but typos here usually surface as opaque API errors. Aliases: ${builtinModelAliases().join(', ')}.\n`,
      )
    }
    // Every model resolution (startup and mid-session /model switches) keeps
    // the registry in sync with the active profile's edit dialect and
    // vocabulary. ORCHENTRA_MODEL_PROFILES=generic (the eval A/B toggle)
    // strips specializations while keeping provider routing.
    applyModelProfile(tools, profileFor(model, activeProfileMode()))
    return { model, ...createProvider(model) }
  }

  const rawModel = config.featureConfig.model ?? options.model
  const initial = resolveModel(rawModel)
  const resolvedPermissionMode = config.featureConfig.permissionMode ?? options.permissionMode
  const resolvedTerseMode = getActiveTerseMode() ?? config.featureConfig.terseMode

  const rawMcp = (config.merged as Record<string, unknown>).mcp
  const mcpManager = McpManager.fromRaw(rawMcp, {
    onLog: (level, message) => {
      if (level !== 'info') process.stderr.write(`[mcp] ${level}: ${message}\n`)
    },
  })
  await mcpManager.connectAll()
  // Once configured MCP servers export more schema than the budget, defer them
  // behind a single mcp_tool_search surface instead of loading every schema.
  mcpManager.registerInto(tools, {
    deferOverTokens: DEFAULT_MCP_DEFER_TOKENS,
    estimateTokens: defaultEstimator,
  })
  const sessionId = randomUUID()

  const sharedState: SharedToolState = {
    taskStore: new InMemoryTaskStore(),
    todos: [],
    agentCounter: 0,
    planMode: false,
    fileReadHashes: new Map(),
    processSupervisor: new ProcessSupervisor(),
    // Browser-free until the first navigate — constructing this pulls no
    // Playwright/Chromium; the first browser op triggers the lazy engine load.
    browser: new BrowserSessionManager({ cwd: options.cwd }),
  }

  // The hook adapter is built before the LiveCli it reports into, so route its
  // progress through a mutable holder that we point at the cli once it exists.
  const hookProgress = { emit: (_u: HookProgressUpdate) => {} }
  const hookRunner = new CliCoreHookAdapter(options.cwd, (u) => hookProgress.emit(u))

  const cli = new LiveCli({
    model: initial.model,
    permissionMode: resolvedPermissionMode,
    provider: initial.provider,
    providerName: initial.providerName,
    resolveModel,
    tools,
    cwd: options.cwd,
    sessionId,
    sharedState,
    effort: config.featureConfig.effort,
    terseMode: resolvedTerseMode,
    memoryConfig: config.featureConfig.memory,
    budgetConfig: config.featureConfig.budget,
    hookRunner,
  })
  hookProgress.emit = (u) => cli.emitHookProgress(u)

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
      // Tear down the browser (no zombie Chromium) and any background dev
      // servers before the session ends — no zombies.
      await sharedState.browser?.shutdown()
      await sharedState.processSupervisor?.shutdown()
      await cli.persistSession()
      await mcpManager.shutdown()
    },
  }
}

function buildToolRegistry(): DefaultToolRegistry {
  return new DefaultToolRegistry()
}
