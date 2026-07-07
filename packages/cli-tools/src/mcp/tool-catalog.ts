import type { ToolDefinition } from '@orchentra/cli-core'

/**
 * When configured MCP servers export more tool schema than this many estimated
 * tokens, the manager stops loading every schema upfront and instead exposes a
 * single search surface (see `tool-search-tool.ts`). Loading dozens of MCP tool
 * schemas on every request is the dominant context cost this deferral removes.
 */
export const DEFAULT_MCP_DEFER_TOKENS = 8_000

/** Serialized form of a tool's schema — what actually rides in the request. */
function schemaText(tool: ToolDefinition): string {
  return JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })
}

/** Estimated tokens the given tool schemas add to every request. */
export function totalSchemaTokens(tools: readonly ToolDefinition[], estimate: (text: string) => number): number {
  let total = 0
  for (const tool of tools) total += estimate(schemaText(tool))
  return total
}

/**
 * Rank a deferred tool catalog against a search query and return the best
 * `limit` matches. A term in a tool's name counts double a term in its
 * description, so `github` surfaces the github tools ahead of any that merely
 * mention it. An empty query returns a name-sorted browse slice so the model
 * can still discover what is available.
 */
export function searchCatalog(tools: readonly ToolDefinition[], query: string, limit: number): ToolDefinition[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const byName = (a: ToolDefinition, b: ToolDefinition): number => a.name.localeCompare(b.name)

  if (terms.length === 0) {
    return [...tools].sort(byName).slice(0, Math.max(0, limit))
  }

  const scored = tools
    .map((tool) => ({ tool, score: scoreTool(tool, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.tool, b.tool))

  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.tool)
}

function scoreTool(tool: ToolDefinition, terms: readonly string[]): number {
  const name = tool.name.toLowerCase()
  const description = tool.description.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (name.includes(term)) score += 2
    if (description.includes(term)) score += 1
  }
  return score
}
