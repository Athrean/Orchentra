import {
  checkImageLimits,
  type ToolDefinition,
  type ToolResult,
  type ToolContext,
  type ToolLevel,
} from '@orchentra/cli-core'
import type { McpClient } from './client'
import { mcpToolName } from './naming'
import { coerceContentToText, extractMcpImages, type McpToolSpec } from './protocol'

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
        // Forward image results as visual content blocks. Oversized images are
        // dropped with a clear note appended to the text rather than silently.
        const images: { data: string; mediaType: string }[] = []
        const notes: string[] = []
        for (const image of extractMcpImages(result.content)) {
          const limitError = checkImageLimits(image)
          if (limitError) notes.push(`image dropped: ${limitError}`)
          else images.push(image)
        }
        const body = [text, ...notes].filter((s) => s.length > 0).join('\n')
        const out: ToolResult = {
          content: body.length > 0 ? body : '(empty response)',
          isError: result.isError === true,
        }
        if (images.length > 0) out.images = images
        return out
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
