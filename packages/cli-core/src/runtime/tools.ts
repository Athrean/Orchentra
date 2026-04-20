import type { ProviderToolSchema } from './provider'
import type { ToolLevel } from './permissions'

export interface ToolContext {
  sessionId: string
  cwd: string
}

export interface ToolResult {
  content: string
  isError: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  level: ToolLevel
  inputSchema: Record<string, unknown>
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolRegistry {
  list(): ProviderToolSchema[]
  has(name: string): boolean
  execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>
}
