import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { editFileInWorkspace } from '../file-ops'

interface EditFileInput {
  path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export const fileEditTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Replace text in a workspace file.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
      replace_all: { type: 'boolean' },
    },
    required: ['path', 'old_string', 'new_string'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as EditFileInput
    if (!input?.path || !input.old_string || input.new_string === undefined) {
      return { content: 'error: path, old_string, and new_string are required', isError: true }
    }

    try {
      const result = await editFileInWorkspace(
        input.path,
        input.old_string,
        input.new_string,
        input.replace_all ?? false,
        ctx.cwd,
      )
      return {
        content: `edited: ${result.filePath} (replaceAll: ${result.replaceAll})`,
        isError: false,
        data: { filePath: result.filePath, replaceAll: result.replaceAll },
        artifacts: [{ uri: result.filePath, kind: 'file', action: 'modified' }],
        evidence: [
          {
            kind: 'diff',
            summary: `${result.structuredPatch.length} hunk(s) applied to ${result.filePath}`,
            detail: result.structuredPatch,
          },
        ],
      }
    } catch (e) {
      return { content: `edit error: ${(e as Error).message}`, isError: true }
    }
  },
}
