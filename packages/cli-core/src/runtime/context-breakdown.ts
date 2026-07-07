import type { ChatMessage, ProviderToolSchema } from './provider'

/**
 * Per-source accounting for what fills the context window, so `/context` can
 * show *where* the input tokens go — not just the aggregate. Kept independent
 * of the MCP naming package: the caller injects a `serverOf` classifier and a
 * token estimator, so this stays a pure, testable calculation in cli-core.
 */

export interface ContextToolSource {
  /** Source label: `built-in` or the MCP server the tools came from. */
  readonly server: string
  readonly tools: number
  /** Estimated tokens the source's schemas add to every request. */
  readonly estimatedTokens: number
}

export interface DuplicateFileRead {
  readonly path: string
  readonly reads: number
}

export interface ContextBreakdown {
  readonly toolSources: readonly ContextToolSource[]
  readonly duplicateReads: readonly DuplicateFileRead[]
}

/**
 * Group tool schemas by source and sum the token cost each contributes to every
 * request. `serverOf` maps a tool name to its source label. Sorted by cost
 * descending so the biggest context eaters read first.
 */
export function groupToolSources(
  tools: readonly ProviderToolSchema[],
  serverOf: (name: string) => string,
  estimate: (text: string) => number,
): ContextToolSource[] {
  const byServer = new Map<string, { tools: number; estimatedTokens: number }>()
  for (const tool of tools) {
    const server = serverOf(tool.name)
    const tokens = estimate(
      JSON.stringify({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }),
    )
    const entry = byServer.get(server) ?? { tools: 0, estimatedTokens: 0 }
    entry.tools += 1
    entry.estimatedTokens += tokens
    byServer.set(server, entry)
  }
  const sources: ContextToolSource[] = []
  byServer.forEach((v, server) => sources.push({ server, tools: v.tools, estimatedTokens: v.estimatedTokens }))
  return sources.sort((a, b) => b.estimatedTokens - a.estimatedTokens)
}

/**
 * Files read more than once across the conversation. Repeated full reads reload
 * content already in context, burning input tokens — a direct context-budget
 * signal. Counts `read_file` tool calls per path; returns paths read at least
 * twice, most-repeated first.
 */
export function findDuplicateReads(messages: readonly ChatMessage[]): DuplicateFileRead[] {
  const counts = new Map<string, number>()
  for (const msg of messages) {
    for (const call of msg.toolCalls ?? []) {
      if (call.name !== 'read_file') continue
      const path = readPath(call.input)
      if (path === null) continue
      counts.set(path, (counts.get(path) ?? 0) + 1)
    }
  }
  const dups: DuplicateFileRead[] = []
  counts.forEach((reads, path) => {
    if (reads > 1) dups.push({ path, reads })
  })
  return dups.sort((a, b) => b.reads - a.reads)
}

function readPath(input: unknown): string | null {
  if (input === null || typeof input !== 'object') return null
  const path = (input as { path?: unknown }).path
  return typeof path === 'string' && path.length > 0 ? path : null
}
