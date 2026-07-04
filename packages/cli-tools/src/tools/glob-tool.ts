import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { globSearchInWorkspace } from '../file-ops'

interface GlobInput {
  pattern: string
  path?: string
}

export const globTool: ToolDefinition = {
  name: 'glob_search',
  description: 'Find files by glob pattern.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      path: { type: 'string' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as GlobInput
    if (!input?.pattern) {
      return { content: 'error: pattern is required', isError: true }
    }

    try {
      const result = await globSearchInWorkspace(input.pattern, ctx.workspaceRoots ?? ctx.cwd, input.path)
      return {
        content: `${result.numFiles} files found (${result.durationMs}ms)${result.truncated ? ' [truncated]' : ''}\n${result.filenames.join('\n')}`,
        isError: false,
      }
    } catch (e) {
      return { content: `glob error: ${(e as Error).message}`, isError: true }
    }
  },
}
