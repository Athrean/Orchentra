import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { readFile } from '../file-ops'

interface ReadFileInput {
  path: string
  offset?: number
  limit?: number
}

export const fileReadTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a text file from the workspace.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1 },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as ReadFileInput
    if (!input?.path) {
      return { content: 'error: path is required', isError: true }
    }

    try {
      const result = await readFile(input.path, input.offset, input.limit)
      return { content: result.file.content, isError: false }
    } catch (e) {
      return { content: `read error: ${(e as Error).message}`, isError: true }
    }
  },
}
