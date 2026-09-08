import { requestWeb, WebError, type WebRequestOptions } from './http'

export interface SearchInput {
  query: string
  max_results?: number
}
export interface SearchResult {
  provider: 'exa'
  query: string
  content: string
  retrievedAt: string
  truncated: boolean
}

/** Strict JSON-RPC parsing: provider failures must never look like zero results. */
export function parseSearchResponse(body: string): string {
  const trimmed = body.trim()
  const payloads = trimmed.startsWith('{')
    ? [trimmed]
    : trimmed.split(/\r?\n\r?\n/).map((event) =>
        event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n'),
      )
  for (const payload of payloads) {
    if (!payload || payload === '[DONE]') continue
    let value
    try {
      value = JSON.parse(payload)
    } catch {
      throw new WebError('invalid_response', 'Search returned malformed JSON')
    }
    if (value.id !== 1) continue
    if (value.error)
      throw new WebError('invalid_response', `Search provider error: ${String(value.error.message ?? 'unknown')}`)
    if (value.result?.isError === true)
      throw new WebError('invalid_response', 'Search provider reported a failed tool call')
    const content: unknown = value.result?.content
    if (
      !Array.isArray(content) ||
      content.some((item) => !item || item.type !== 'text' || typeof item.text !== 'string')
    ) {
      throw new WebError('invalid_response', 'Search returned an invalid content envelope')
    }
    return content.map((item) => item.text).join('\n') || 'No results returned by Exa.'
  }
  throw new WebError('invalid_response', 'Search response is missing its matching result')
}

export async function searchWeb(
  input: SearchInput,
  options: WebRequestOptions & { apiKey?: string } = {},
): Promise<SearchResult> {
  const response = await requestWeb('https://mcp.exa.ai/mcp', {
    ...options,
    method: 'POST',
    maxBytes: 256 * 1024,
    timeoutMs: 25_000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: input.query,
          numResults: input.max_results ?? 5,
          type: 'auto',
          contextMaxCharacters: 20_000,
        },
      },
    }),
  })
  if (response.status === 429)
    throw new WebError(
      'rate_limited',
      'Exa free search is rate limited. Retry later or configure your own search MCP server.',
    )
  if (response.status < 200 || response.status >= 300)
    throw new WebError('http_error', `Exa search returned HTTP ${response.status}`)
  const content = parseSearchResponse(response.body)
  return {
    provider: 'exa',
    query: input.query,
    content: content.slice(0, 30_000),
    retrievedAt: new Date().toISOString(),
    truncated: content.length > 30_000,
  }
}
