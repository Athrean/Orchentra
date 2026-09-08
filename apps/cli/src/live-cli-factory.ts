import { ExtensionStore, type ParsedSkill, type SkillLoadError } from '@orchentra/cli-core'
import { loadExtensionCatalog } from './extensions/catalog'
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
  resolveExecutionProfile,
  type ExecutionProfile,
  type PermissionMode,
  type Provider,
  type SharedToolState,
} from '@orchentra/cli-core'
import { getActiveTerseMode, getSessionsDirForWorkspace } from './session-config'
import { BrowserSessionManager } from '@orchentra/cli-browser'
import {
  BUILTIN_TOOLS,
  contextTools,
  rlmExecuteTool,
  DefaultToolRegistry,
  McpManager,
  DEFAULT_MCP_DEFER_TOKENS,
  applyModelProfile,
  createAgentTool,
  createSkillTool,
  resolveAgentRoles,
  type SubagentCaps,
  type SubagentRole,
} from '@orchentra/cli-tools'
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
  readonly executionProfile?: ExecutionProfile
  /** Overrides the configured per-turn output cap (experiment harnesses). */
  readonly maxOutputTokens?: number
}

export interface CliContext {
  readonly cli: LiveCli
  readonly sessionId: string
  readonly sessionPath: string
  readonly resolvedModel: string
  readonly resolvedPermissionMode: PermissionMode
  readonly providerName: string
  readonly executionProfile: ExecutionProfile
  readonly extensionSkills: { skills: ParsedSkill[]; errors: SkillLoadError[] }
  readonly extensionStore: ExtensionStore
  reloadExtensions(): Promise<{ skills: ParsedSkill[]; errors: SkillLoadError[] }>
  close(): Promise<void>
}

export async function createCliContext(options: CliContextOptions): Promise<CliContext> {
  const config = ConfigLoader.defaultFor(options.cwd).load()
  const executionProfile = resolveExecutionProfile({
    override: options.executionProfile,
    configured: config.featureConfig.executionProfile,
  })
  const userAliases = config.featureConfig.aliases as Record<string, string> | undefined
  // Discover user/project agent definitions once per process, not per tool-call,
  // and build the `agent` tool over the merged role set so custom types are
  // spawnable by name and the depth/fan-out caps honor config.
  const extensionStore = new ExtensionStore()
  let extensionCatalog = await loadExtensionCatalog(options.cwd, extensionStore)
  const agentRoles = { ...(await resolveAgentRoles(options.cwd)), ...extensionCatalog.agents }
  const tools = buildToolRegistry(agentRoles, config.featureConfig.subagents, executionProfile)
  const resolveNestedModel: ModelResolver = (raw: string) => {
    const model = resolveModelAlias(raw, userAliases)
    if (!isKnownModel(model)) {
      process.stderr.write(
        `[orchentra] warn: model '${model}' is not in the known-model list. Provider will still try to call it, but typos here usually surface as opaque API errors. Aliases: ${builtinModelAliases().join(', ')}.\n`,
      )
    }
    return { model, ...createProvider(model) }
  }
  const resolveModel: ModelResolver = (raw: string) => {
    const resolved = resolveNestedModel(raw)
    // Root model resolution keeps the shared registry in sync. Nested model
    // overrides deliberately use resolveNestedModel above so they cannot
    // mutate the root tool dialect while a child is running.
    const model = resolved.model
    applyModelProfile(tools, profileFor(model, activeProfileMode()))
    return resolved
  }

  const rawModel = config.featureConfig.model ?? options.model
  const initial = resolveModel(rawModel)
  const resolvedPermissionMode = config.featureConfig.permissionMode ?? options.permissionMode
  const resolvedTerseMode = getActiveTerseMode() ?? config.featureConfig.terseMode
  const rawMcp = (config.merged as Record<string, unknown>).mcp
  const mcpRaw = (): unknown => ({
    servers: {
      ...((rawMcp as { servers?: Record<string, unknown> } | undefined)?.servers ?? {}),
      ...extensionCatalog.servers,
    },
  })
  let mcpManager = McpManager.fromRaw(mcpRaw(), {
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
  tools.register(createSkillTool(extensionCatalog.skills))
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
  hookRunner.setExtensionHooks(extensionCatalog.hooks)

  const cli = new LiveCli({
    model: initial.model,
    permissionMode: resolvedPermissionMode,
    provider: initial.provider,
    providerName: initial.providerName,
    resolveModel,
    resolveNestedModel,
    tools,
    cwd: options.cwd,
    sessionId,
    sharedState,
    effort: config.featureConfig.effort,
    terseMode: resolvedTerseMode,
    memoryConfig: config.featureConfig.memory,
    budgetConfig: config.featureConfig.budget,
    hookRunner,
    executionProfile,
    speculativeToolCalls: config.featureConfig.rlm.speculativeToolCalls,
    maxOutputTokens: options.maxOutputTokens ?? config.featureConfig.maxOutputTokens,
    modelFunctionLimits: config.featureConfig.subagents,
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
    executionProfile,
    extensionSkills: { skills: extensionCatalog.skills, errors: extensionCatalog.errors },
    extensionStore,
    async reloadExtensions() {
      extensionCatalog = await loadExtensionCatalog(cli.getCwd(), extensionStore)
      await mcpManager.shutdown()
      for (const tool of tools.list()) {
        if (tool.name.startsWith('mcp__') || tool.name === 'mcp_tool_search') tools.unregister(tool.name)
      }
      mcpManager = McpManager.fromRaw(mcpRaw(), {
        onLog: (level, message) => {
          if (level !== 'info') process.stderr.write(`[mcp] ${level}: ${message}\n`)
        },
      })
      await mcpManager.connectAll()
      mcpManager.registerInto(tools, { deferOverTokens: DEFAULT_MCP_DEFER_TOKENS, estimateTokens: defaultEstimator })
      tools.register(createSkillTool(extensionCatalog.skills))
      tools.register(
        createAgentTool(
          { ...(await resolveAgentRoles(cli.getCwd())), ...extensionCatalog.agents },
          config.featureConfig.subagents,
        ),
      )
      hookRunner.setExtensionHooks(extensionCatalog.hooks)
      return { skills: extensionCatalog.skills, errors: extensionCatalog.errors }
    },
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

export function buildToolRegistry(
  roles: Record<string, SubagentRole>,
  caps: SubagentCaps,
  executionProfile: ExecutionProfile,
): DefaultToolRegistry {
  // The dynamic `agent` tool (built over the merged roles) overrides the static
  // one baked into BUILTIN_TOOLS — same tool name, so the registry Map dedups.
  return new DefaultToolRegistry([
    ...BUILTIN_TOOLS,
    createAgentTool(roles, caps),
    ...(executionProfile === 'rlm' ? [...contextTools, rlmExecuteTool] : []),
  ])
}
