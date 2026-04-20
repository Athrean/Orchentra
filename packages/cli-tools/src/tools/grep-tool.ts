import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'
import { grepSearch } from '../file-ops'

interface GrepInput {
  pattern: string
  path?: string
  glob?: string
  output_mode?: string
  context?: number
  head_limit?: number
  offset?: number
  case_insensitive?: boolean
  file_type?: string
  multiline?: boolean
}

export const grepTool: ToolDefinition = {
  name: 'grep_search',
  description: 'Search file contents with a regex pattern.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string' },
      path: { type: 'string' },
      glob: { type: 'string' },
      output_mode: { type: 'string' },
      context: { type: 'integer', minimum: 0 },
      head_limit: { type: 'integer', minimum: 1 },
      offset: { type: 'integer', minimum: 0 },
      case_insensitive: { type: 'boolean' },
      file_type: { type: 'string' },
      multiline: { type: 'boolean' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as GrepInput
    if (!input?.pattern) {
      return { content: 'error: pattern is required', isError: true }
    }

    try {
      const result = await grepSearch({
        pattern: input.pattern,
        path: input.path,
        glob: input.glob,
        outputMode: input.output_mode,
        context: input.context,
        headLimit: input.head_limit,
        offset: input.offset,
        caseInsensitive: input.case_insensitive,
        fileType: input.file_type,
        multiline: input.multiline,
      })

      const header = `${result.numFiles} files matched`
      const body = result.content ?? result.filenames.join('\n')
      return { content: `${header}\n${body}`, isError: false }
    } catch (e) {
      return { content: `grep error: ${(e as Error).message}`, isError: true }
    }
  },
}
