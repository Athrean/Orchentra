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

export type IncomingMessage = JsonRpcRequest | JsonRpcNotification

export interface ServerInfo {
  name: string
  version: string
}
