import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { patchFileInWorkspace } from '../file-ops'

interface ApplyPatchInput {
  path: string
  patch: string
}

/**
 * Unified-diff edit dialect (M5). Not a builtin — swapped in for edit_file by
 * applyModelProfile when a family's profile selects editDialect
 * 'unified-diff'. Same safety rails as edit_file: workspace boundary,
 * stale-read hash guard, atomic write, diff evidence.
 */
export const filePatchTool: ToolDefinition = {
  name: 'apply_patch',
  description:
    'Edit a workspace file by applying a unified diff. Provide one or more @@ hunks with context lines; ' +
    'file headers (---/+++) are optional and ignored. Hunks must anchor uniquely — ' +
    'add surrounding context lines if a hunk could match more than one location.',
  level: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      patch: { type: 'string' },
    },
    required: ['path', 'patch'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const input = args as ApplyPatchInput
    if (!input?.path || !input.patch) {
      return { content: 'error: path and patch are required', isError: true }
    }

    try {
      const result = await patchFileInWorkspace(input.path, input.patch, ctx.cwd, ctx.sharedState?.fileReadHashes)
      return {
        content: `patched: ${result.filePath} (${result.hunksApplied} hunk(s))`,
        isError: false,
        data: { filePath: result.filePath, hunksApplied: result.hunksApplied },
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
      return { content: `patch error: ${(e as Error).message}`, isError: true }
    }
  },
}
