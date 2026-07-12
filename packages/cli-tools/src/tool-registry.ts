import {
  requiredModeForLevel,
  type ToolRegistry,
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
  type ProviderToolSchema,
  type PermissionMode,
} from '@orchentra/cli-core'
import { bashTool } from './tools/bash-tool'
import { fileReadTool } from './tools/file-read-tool'
import { fileWriteTool } from './tools/file-write-tool'
import { fileEditTool } from './tools/file-edit-tool'
import { globTool } from './tools/glob-tool'
import { grepTool } from './tools/grep-tool'
import { diagnosticsTool } from './tools/diagnostics-tool'
import { webFetchTool } from './tools/web-fetch-tool'
import { webSearchTool } from './tools/web-search-tool'
import { askUserTool } from './tools/ask-user-tool'
import { todoWriteTool } from './tools/todo-write-tool'
import { agentTool } from './tools/agent-tool'
import { notebookEditTool } from './tools/notebook-edit-tool'
import { enterPlanModeTool, exitPlanModeTool } from './tools/plan-mode-tool'
import { githubListIssuesTool, githubGetIssueTool } from './github/issues'
import { githubListPullsTool, githubGetPullTool } from './github/pulls'
import { githubSearchIssuesTool } from './github/search'
import { gitStatusTool, gitDiffTool, gitLogTool } from './tools/git-tools'

const BUILTIN_TOOLS: ToolDefinition[] = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  diagnosticsTool,
  webFetchTool,
  webSearchTool,
  askUserTool,
  todoWriteTool,
  agentTool,
  notebookEditTool,
  enterPlanModeTool,
  exitPlanModeTool,
  githubListIssuesTool,
  githubGetIssueTool,
  githubListPullsTool,
  githubGetPullTool,
  githubSearchIssuesTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
]

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

  requirements(): Readonly<Record<string, PermissionMode>> {
    const requirements: Record<string, PermissionMode> = {}
    for (const tool of Array.from(this.tools.values())) {
      requirements[tool.name] = requiredModeForLevel(tool.level)
    }
    return requirements
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
