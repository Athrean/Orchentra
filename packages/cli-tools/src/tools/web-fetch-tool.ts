import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface WebFetchInput {
  url: string
  max_length?: number
}

const DEFAULT_MAX_LENGTH = 50_000

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch a URL and return its contents as text.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' },
      max_length: { type: 'integer', description: 'Max response length in characters', minimum: 1 },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as WebFetchInput
    if (!input?.url) {
      return { content: 'error: url is required', isError: true }
    }
    try {
      const response = await fetch(input.url, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'orchentra-cli/0.1' },
      })
      if (!response.ok) {
        return {
          content: `error: HTTP ${response.status} ${response.statusText}`,
          isError: true,
        }
      }
      const text = await response.text()
      const maxLen = input.max_length ?? DEFAULT_MAX_LENGTH
      const truncated = text.length > maxLen
      const body = truncated ? text.slice(0, maxLen) + '\n... (truncated)' : text
      return { content: body, isError: false }
    } catch (e) {
      return { content: `web_fetch error: ${(e as Error).message}`, isError: true }
    }
  },
}
