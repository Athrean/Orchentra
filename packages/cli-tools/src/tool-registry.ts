import type { ToolRegistry, ToolDefinition, ToolContext, ToolResult, ProviderToolSchema } from '@orchentra/cli-core'
import { bashTool } from './tools/bash-tool'
import { fileReadTool } from './tools/file-read-tool'
import { fileWriteTool } from './tools/file-write-tool'
import { fileEditTool } from './tools/file-edit-tool'
import { globTool } from './tools/glob-tool'
import { grepTool } from './tools/grep-tool'

const BUILTIN_TOOLS: ToolDefinition[] = [bashTool, fileReadTool, fileWriteTool, fileEditTool, globTool, grepTool]

export class DefaultToolRegistry implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  constructor(initialTools?: ToolDefinition[]) {
    const tools = initialTools ?? BUILTIN_TOOLS
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  list(): ProviderToolSchema[] {
    const schemas: ProviderToolSchema[] = []
    for (const tool of Array.from(this.tools.values())) {
      schemas.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })
    }
    return schemas
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  async execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { content: `unsupported tool: ${name}`, isError: true }
    }
    return tool.execute(args, ctx)
  }

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }
}

export { BUILTIN_TOOLS }
