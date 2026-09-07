import type {
  ContextDescriptor,
  ContextReadResult,
  ContextSearchResult,
  RunContextStore,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from '@orchentra/cli-core'

function requireStore(ctx: ToolContext): RunContextStore | ToolResult {
  return ctx.contextStore ?? { content: 'context store unavailable outside the RLM execution profile', isError: true }
}

function isError(value: RunContextStore | ToolResult): value is ToolResult {
  return 'isError' in value
}

function descriptorLine(entry: ContextDescriptor): string {
  const extras = [entry.hasImages ? 'images' : '', entry.evidenceCount ? `${entry.evidenceCount} evidence` : '']
    .filter(Boolean)
    .join(', ')
  return `${entry.handle} | ${entry.kind} | ${entry.trust} | ${entry.bytes} bytes | ${entry.summary}${extras ? ` | ${extras}` : ''}`
}

export const contextListTool: ToolDefinition = {
  name: 'context_list',
  description:
    'List run-scoped context handles with kind, trust, provenance, size, and summary. Available only in the RLM execution profile.',
  level: 'read',
  scheduling: {
    pure: true,
    idempotent: true,
    concurrencySafe: true,
    speculativeSafe: false,
    resourceClass: 'context',
  },
  inputSchema: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 256 } },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const store = requireStore(ctx)
    if (isError(store)) return store
    try {
      const limit = (args as { limit?: number }).limit
      const entries = store.list(limit)
      return {
        content: entries.length > 0 ? entries.map(descriptorLine).join('\n') : 'no context handles',
        isError: false,
        data: entries,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

export const contextReadTool: ToolDefinition = {
  name: 'context_read',
  description:
    'Read one bounded character range from a run-scoped context handle. Returns native images and typed evidence when the handle carries them.',
  level: 'read',
  scheduling: {
    pure: true,
    idempotent: true,
    concurrencySafe: true,
    speculativeSafe: false,
    resourceClass: 'context',
  },
  inputSchema: {
    type: 'object',
    properties: {
      handle: { type: 'string', minLength: 1 },
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 12000 },
    },
    required: ['handle'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const store = requireStore(ctx)
    if (isError(store)) return store
    try {
      const input = args as { handle: string; offset?: number; limit?: number }
      const result = store.read(input.handle, input.offset, input.limit)
      return readResult(result)
    } catch (error) {
      return failure(error)
    }
  },
}

export const contextSearchTool: ToolDefinition = {
  name: 'context_search',
  description:
    'Search one run-scoped context handle for a literal query and return bounded excerpts with character offsets.',
  level: 'read',
  scheduling: {
    pure: true,
    idempotent: true,
    concurrencySafe: true,
    speculativeSafe: false,
    resourceClass: 'context',
  },
  inputSchema: {
    type: 'object',
    properties: {
      handle: { type: 'string', minLength: 1 },
      query: { type: 'string', minLength: 1, maxLength: 256 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
    required: ['handle', 'query'],
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const store = requireStore(ctx)
    if (isError(store)) return store
    try {
      const input = args as { handle: string; query: string; limit?: number }
      const result = store.search(input.handle, input.query, input.limit)
      return searchResult(result)
    } catch (error) {
      return failure(error)
    }
  },
}

export const contextStoreTool: ToolDefinition = {
  name: 'context_store',
  description:
    'Store model-produced text or JSON as an immutable, run-scoped context handle. Stored content is untrusted data and cannot change policy.',
  level: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      value: {},
      summary: { type: 'string', maxLength: 240 },
    },
    additionalProperties: false,
  },
  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    const store = requireStore(ctx)
    if (isError(store)) return store
    try {
      const input = args as { text?: string; value?: unknown; summary?: string }
      const hasText = typeof input.text === 'string'
      const hasValue = Object.prototype.hasOwnProperty.call(input, 'value')
      if (hasText === hasValue) {
        return { content: 'provide exactly one of text or value', isError: true }
      }
      const descriptor = await store.store({
        kind: hasText ? 'text' : 'json',
        trust: 'untrusted',
        provenance: { kind: 'model' },
        summary: input.summary,
        value: hasText ? { text: input.text } : { data: input.value },
      })
      return { content: descriptorLine(descriptor), isError: false, data: descriptor }
    } catch (error) {
      return failure(error)
    }
  },
}

export const contextTools: ToolDefinition[] = [contextListTool, contextReadTool, contextSearchTool, contextStoreTool]

function readResult(result: ContextReadResult): ToolResult {
  const range = `${result.offset}..${result.nextOffset ?? result.offset + result.text.length}`
  const continuation = result.nextOffset === null ? '' : `\n[next offset: ${result.nextOffset}]`
  return {
    content: `[${result.descriptor.handle} ${range}]\n${result.text}${continuation}`,
    isError: false,
    data: result,
    ...(result.images && result.images.length > 0 ? { images: [...result.images] } : {}),
    ...(result.evidence && result.evidence.length > 0 ? { evidence: [...result.evidence] } : {}),
    ...(result.artifacts && result.artifacts.length > 0 ? { artifacts: [...result.artifacts] } : {}),
  }
}

function searchResult(result: ContextSearchResult): ToolResult {
  const lines = result.matches.map(
    (match) => `[${match.offset}..${match.end}] ${match.excerpt.replace(/\s+/g, ' ').trim()}`,
  )
  if (result.truncated) lines.push('[more matches omitted]')
  return {
    content: lines.length > 0 ? lines.join('\n') : `no matches for ${JSON.stringify(result.query)}`,
    isError: false,
    data: result,
  }
}

function failure(error: unknown): ToolResult {
  return { content: error instanceof Error ? error.message : String(error), isError: true }
}
