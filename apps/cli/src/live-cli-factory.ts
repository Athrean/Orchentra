import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ConfigLoader, SessionWriter, type PermissionMode, type Provider, type ToolRegistry } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
  DASHSCOPE_CONFIG,
} from '@orchentra/cli-api'
import { DefaultToolRegistry, BUILTIN_TOOLS, McpManager } from '@orchentra/cli-tools'
import { LiveCli } from './live-cli'

export interface CliContextOptions {
  readonly model: string
  readonly permissionMode: PermissionMode
  readonly cwd: string
}

export interface CliContext {
  readonly cli: LiveCli
  readonly sessionId: string
  readonly resolvedModel: string
  readonly resolvedPermissionMode: PermissionMode
  close(): Promise<void>
}

export async function createCliContext(options: CliContextOptions): Promise<CliContext> {
  const config = ConfigLoader.defaultFor(options.cwd).load()
  const resolvedModel = config.featureConfig.model ?? options.model
  const resolvedPermissionMode = config.featureConfig.permissionMode ?? options.permissionMode

  const provider = resolveProvider(resolvedModel)
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

  const cli = new LiveCli({
    model: resolvedModel,
    permissionMode: resolvedPermissionMode,
    provider,
    tools,
    cwd: options.cwd,
    sessionId,
  })

  const session = await SessionWriter.open({
    rootDir: join(options.cwd, '.orchentra', 'sessions'),
    meta: { cwd: options.cwd, model: resolvedModel },
  })
  cli.setSession(session)

  return {
    cli,
    sessionId,
    resolvedModel,
    resolvedPermissionMode,
    async close(): Promise<void> {
      await cli.persistSession()
      await mcpManager.shutdown()
    },
  }
}

function resolveProvider(model: string): Provider {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt') || lower.includes('openai')) return new OpenAiCompatProvider(OPENAI_CONFIG)
  if (lower.startsWith('grok') || lower.includes('xai')) return new OpenAiCompatProvider(XAI_CONFIG)
  if (lower.includes('qwen') || lower.includes('dashscope')) return new OpenAiCompatProvider(DASHSCOPE_CONFIG)
  return new AnthropicProvider()
}

function buildToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry()
  for (const tool of BUILTIN_TOOLS) registry.register(tool)
  return registry
}
