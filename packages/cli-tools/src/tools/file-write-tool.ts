import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { writeFileInWorkspace } from '../file-ops'

interface WriteFileInput {
  path: string
  content: string
}

export const fileWriteTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write a text file in the workspace.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as WriteFileInput
    if (!input?.path || input.content === undefined) {
      return { content: 'error: path and content are required', isError: true }
    }

    try {
      const result = await writeFileInWorkspace(input.path, input.content, ctx.cwd)
      return {
        content: `${result.type}: ${result.filePath}`,
        isError: false,
      }
    } catch (e) {
      return { content: `write error: ${(e as Error).message}`, isError: true }
    }
  },
}
