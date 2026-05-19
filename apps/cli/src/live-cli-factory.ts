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
import {
  AnthropicProvider,
  OpenAiCompatProvider,
  GeminiProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
  DASHSCOPE_CONFIG,
} from '@orchentra/cli-api'
import { DefaultToolRegistry, BUILTIN_TOOLS, McpManager } from '@orchentra/cli-tools'
import { LiveCli } from './live-cli'

const BUILTIN_MODEL_ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-20250514',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-20250514',
  grok: 'grok-3',
  'grok-mini': 'grok-3-mini',
  gemini: 'gemini-2.0-flash',
  'gemini-pro': 'gemini-2.0-pro',
  'gemini-flash': 'gemini-2.0-flash',
}

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
        `[orchentra] warn: model '${model}' is not in the known-model list. Provider will still try to call it, but typos here usually surface as opaque API errors. Aliases: ${Object.keys(BUILTIN_MODEL_ALIASES).join(', ')}.\n`,
      )
    }
    return { model, provider: resolveProvider(model), providerName: resolveProviderName(model) }
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

  const cli = new LiveCli({
    model: initial.model,
    permissionMode: resolvedPermissionMode,
    provider: initial.provider,
    resolveModel,
    tools,
    cwd: options.cwd,
    sessionId,
    sharedState,
    memoryConfig: config.featureConfig.memory,
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

function resolveModelAlias(input: string, userAliases?: Record<string, string>): string {
  const lower = input.toLowerCase()
  if (userAliases && userAliases[lower]) return userAliases[lower]
  if (BUILTIN_MODEL_ALIASES[lower]) return BUILTIN_MODEL_ALIASES[lower]
  return input
}

function resolveProvider(model: string): Provider {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt') || lower.includes('openai')) return new OpenAiCompatProvider(OPENAI_CONFIG)
  if (lower.startsWith('grok') || lower.includes('xai')) return new OpenAiCompatProvider(XAI_CONFIG)
  if (lower.includes('qwen') || lower.includes('dashscope')) return new OpenAiCompatProvider(DASHSCOPE_CONFIG)
  if (lower.startsWith('gemini') || lower.includes('google')) return new GeminiProvider({ model })
  return new AnthropicProvider()
}

function resolveProviderName(model: string): string {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt') || lower.includes('openai')) return 'openai'
  if (lower.startsWith('grok') || lower.includes('xai')) return 'xai'
  if (lower.includes('qwen') || lower.includes('dashscope')) return 'dashscope'
  if (lower.startsWith('gemini') || lower.includes('google')) return 'gemini'
  return 'anthropic'
}

function buildToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry()
  for (const tool of BUILTIN_TOOLS) registry.register(tool)
  return registry
}
