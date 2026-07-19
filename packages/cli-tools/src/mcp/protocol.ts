export const JSON_RPC_VERSION = '2.0'
export const MCP_PROTOCOL_VERSION = '2025-03-26'

export type JsonRpcId = number | string

export interface JsonRpcRequest {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: typeof JSON_RPC_VERSION
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcSuccess {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  result: unknown
}

export interface JsonRpcFailure {
  jsonrpc: typeof JSON_RPC_VERSION
  id: JsonRpcId
  error: JsonRpcError
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export interface McpClientInfo {
  name: string
  version: string
}

export interface McpServerInfo {
  name: string
  version: string
}

export interface McpInitializeParams {
  protocolVersion: string
  capabilities: Record<string, unknown>
  clientInfo: McpClientInfo
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: Record<string, unknown>
  serverInfo: McpServerInfo
}

export interface McpToolSpec {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpToolsListResult {
  tools: McpToolSpec[]
}

export interface McpToolsCallParams {
  name: string
  arguments?: Record<string, unknown>
}

export type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; mimeType?: string } }
  | { type: string; [key: string]: unknown }

export interface McpToolsCallResult {
  content: McpContentBlock[]
  isError?: boolean
}

export function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  if (!isObject(value)) return false
  if (value.jsonrpc !== JSON_RPC_VERSION) return false
  if (!('id' in value)) return false
  return 'result' in value || 'error' in value
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Pulls image blocks out of an MCP tool result into the canonical
 * `{ data, mediaType }` shape so they can ride to the model as visual content
 * instead of being flattened to a `[image/png]` text placeholder.
 */
export function extractMcpImages(content: McpContentBlock[]): { data: string; mediaType: string }[] {
  const images: { data: string; mediaType: string }[] = []
  for (const block of content) {
    if (block.type === 'image' && typeof block.data === 'string' && typeof block.mimeType === 'string') {
      images.push({ data: block.data, mediaType: block.mimeType })
    }
  }
  return images
}

export function coerceContentToText(content: McpContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    } else if (block.type === 'image' && 'mimeType' in block) {
      parts.push(`[${String(block.mimeType)}]`)
    } else if (block.type === 'resource' && isObject(block.resource)) {
      const uri = typeof block.resource.uri === 'string' ? block.resource.uri : '?'
      const text = typeof block.resource.text === 'string' ? `: ${block.resource.text}` : ''
      parts.push(`[resource ${uri}${text}]`)
    } else {
      parts.push(`[${block.type}]`)
    }
  }
  return parts.join('\n')
}
