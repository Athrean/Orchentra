import { ConfigLoader, type PermissionMode, type Provider, type ToolRegistry, SessionWriter } from '@orchentra/cli-core'
import {
  AnthropicProvider,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
  DASHSCOPE_CONFIG,
} from '@orchentra/cli-api'
import { DefaultToolRegistry, BUILTIN_TOOLS } from '@orchentra/cli-tools'
import { CLI_NAME, CLI_VERSION } from './version'
import { readLine } from './input'
import { LiveCli } from './live-cli'
import { parseSlashCommand, dispatchCommand, renderCommandHelp } from './commands'
import type { CommandContext } from './commands'
import { randomUUID } from 'node:crypto'

export interface ReplOptions {
  model: string
  permissionMode: PermissionMode
  cwd: string
}

export async function runRepl(options: ReplOptions): Promise<number> {
  const config = ConfigLoader.defaultFor(options.cwd).load()

  const resolvedModel = config.featureConfig.model ?? options.model
  const resolvedMode = config.featureConfig.permissionMode ?? options.permissionMode

  const provider = resolveProvider(resolvedModel)
  const tools = buildToolRegistry()

  const sessionId = randomUUID()
  const cli = new LiveCli({
    model: resolvedModel,
    permissionMode: resolvedMode,
    provider,
    tools,
    cwd: options.cwd,
    sessionId,
  })

  const session = await SessionWriter.open({
    meta: {
      cwd: options.cwd,
      model: resolvedModel,
    },
  })
  cli.setSession(session)

  process.stdout.write(`${CLI_NAME} ${CLI_VERSION}\n`)
  process.stdout.write(`Model: ${resolvedModel} | Mode: ${resolvedMode}\n`)
  process.stdout.write(`Session: ${sessionId}\n\n`)
  process.stdout.write(renderCommandHelp() + '\n\n')

  let running = true
  while (running) {
    const outcome = await readLine('> ')
    switch (outcome.type) {
      case 'exit':
        running = false
        break
      case 'cancel':
        break
      case 'submit': {
        const trimmed = outcome.text.trim()
        if (trimmed.length === 0) break

        const slash = parseSlashCommand(trimmed)
        if (slash === null) {
          await cli.runTurn(trimmed)
          break
        }
        if (slash instanceof Error) {
          process.stdout.write(`${slash.message}\n`)
          break
        }

        if (slash.kind === 'exit') {
          running = false
          break
        }

        const ctx: CommandContext = {
          model: cli.currentModel,
          permissionMode: cli.currentPermissionMode,
          sessionId,
          turns: cli.turns,
          cwd: options.cwd,
        }
        const shouldContinue = await dispatchCommand(slash, ctx)
        if (slash.kind === 'clear') {
          cli.clearHistory()
        }
        if (!shouldContinue) {
          running = false
        }
        break
      }
    }

    process.stdout.write('\n')
  }

  await cli.persistSession()
  return 0
}

function resolveProvider(model: string): Provider {
  const lower = model.toLowerCase()

  if (lower.startsWith('gpt') || lower.includes('openai')) {
    return new OpenAiCompatProvider(OPENAI_CONFIG)
  }
  if (lower.startsWith('grok') || lower.includes('xai')) {
    return new OpenAiCompatProvider(XAI_CONFIG)
  }
  if (lower.includes('qwen') || lower.includes('dashscope')) {
    return new OpenAiCompatProvider(DASHSCOPE_CONFIG)
  }

  return new AnthropicProvider()
}

function buildToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry()
  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool)
  }
  return registry
}
