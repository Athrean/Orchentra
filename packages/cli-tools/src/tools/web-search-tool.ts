import type { ToolDefinition, ToolResult, ToolContext } from '@orchentra/cli-core'

interface WebSearchInput {
  query: string
  max_results?: number
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web using a search API. Requires a configured search endpoint.',
  level: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      max_results: { type: 'integer', description: 'Max number of results', minimum: 1, maximum: 20 },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const input = args as WebSearchInput
    if (!input?.query) {
      return { content: 'error: query is required', isError: true }
    }

    const searchUrl = process.env.ORCHENTRA_SEARCH_URL
    const searchApiKey = process.env.ORCHENTRA_SEARCH_API_KEY

    if (!searchUrl) {
      return {
        content:
          'error: web search not configured. Set ORCHENTRA_SEARCH_URL (and optionally ORCHENTRA_SEARCH_API_KEY) environment variables.',
        isError: true,
      }
    }

    try {
      const maxResults = input.max_results ?? 5
      const url = `${searchUrl}?q=${encodeURIComponent(input.query)}&count=${maxResults}`
      const headers: Record<string, string> = { 'User-Agent': 'orchentra-cli/0.1' }
      if (searchApiKey) headers['Authorization'] = `Bearer ${searchApiKey}`

      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers,
      })
      if (!response.ok) {
        return {
          content: `error: search API returned HTTP ${response.status}`,
          isError: true,
        }
      }
      const data = (await response.json()) as { results?: Array<{ title: string; url: string; snippet?: string }> }
      const results = data.results ?? []
      if (results.length === 0) {
        return { content: 'No results found.', isError: false }
      }
      const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`)
      return { content: lines.join('\n\n'), isError: false }
    } catch (e) {
      return { content: `web_search error: ${(e as Error).message}`, isError: true }
    }
  },
}
