import type { ToolDefinition, ToolResult, ToolContext, ToolLevel } from '@orchentra/cli-core'
import type { McpClient } from './client'
import { mcpToolName } from './naming'
import { coerceContentToText, type McpToolSpec } from './protocol'

export interface BridgeToolOptions {
  readonly serverName: string
  readonly spec: McpToolSpec
  readonly client: McpClient
  readonly level: ToolLevel
  readonly timeoutMs: number
}

export function buildMcpToolDefinition(options: BridgeToolOptions): ToolDefinition {
  const qualifiedName = mcpToolName(options.serverName, options.spec.name)
  const description = options.spec.description
    ? `[mcp:${options.serverName}] ${options.spec.description}`
    : `[mcp:${options.serverName}] ${options.spec.name}`

  return {
    name: qualifiedName,
    description,
    level: options.level,
    inputSchema: options.spec.inputSchema,
    async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const input = isObject(args) ? args : {}
      try {
        const result = await options.client.callTool(options.spec.name, input, options.timeoutMs)
        const text = coerceContentToText(result.content)
        return { content: text.length > 0 ? text : '(empty response)', isError: result.isError === true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { content: `MCP tool error: ${message}`, isError: true }
      }
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
