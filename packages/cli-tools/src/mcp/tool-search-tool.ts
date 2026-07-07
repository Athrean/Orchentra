import type { ToolDefinition, ToolRegistry, ToolResult } from '@orchentra/cli-core'
import { searchCatalog } from './tool-catalog'

export const MCP_TOOL_SEARCH_NAME = 'mcp_tool_search'

const DEFAULT_MAX_RESULTS = 5

export interface McpToolSearchOptions {
  /** Deferred MCP tools whose schemas were kept out of the request. */
  readonly catalog: readonly ToolDefinition[]
  /** Live registry the matched tools are registered into on demand. */
  readonly registry: ToolRegistry
  readonly defaultMaxResults?: number
}

/**
 * A single lightweight tool that stands in for a large set of deferred MCP
 * tools. The model searches it by keyword; matches are registered into the live
 * registry so their full schemas surface on the next step and become callable —
 * the same defer-then-load pattern that keeps unused MCP schemas out of context.
 */
export function buildMcpToolSearchTool(options: McpToolSearchOptions): ToolDefinition {
  const fallbackLimit = options.defaultMaxResults ?? DEFAULT_MAX_RESULTS
  return {
    name: MCP_TOOL_SEARCH_NAME,
    description:
      `Search ${options.catalog.length} deferred MCP tools by keyword. Their full schemas are not ` +
      'loaded upfront to save context. Matching tools are loaded and become callable on your next ' +
      'step. Query by name or purpose (e.g. "github issue"); an empty query lists what is available.',
    level: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to match against tool names and descriptions.' },
        max_results: { type: 'number', description: `Maximum tools to load (default ${fallbackLimit}).` },
      },
    },
    async execute(args: unknown): Promise<ToolResult> {
      const { query, maxResults } = parseArgs(args, fallbackLimit)
      const matches = searchCatalog(options.catalog, query, maxResults)
      if (matches.length === 0) {
        return { content: `No MCP tools match "${query.trim()}".`, isError: false }
      }
      for (const tool of matches) options.registry.register(tool)
      const lines = matches.map((t) => `- ${t.name} — ${t.description}`)
      return {
        content: `Loaded ${matches.length} MCP tool(s); callable on your next step:\n${lines.join('\n')}`,
        isError: false,
      }
    },
  }
}

function parseArgs(args: unknown, fallbackLimit: number): { query: string; maxResults: number } {
  const obj = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  const query = typeof obj.query === 'string' ? obj.query : ''
  const raw = obj.max_results
  const maxResults = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallbackLimit
  return { query, maxResults }
}
