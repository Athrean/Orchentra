import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeResult,
  McpToolSpec,
  McpToolsCallResult,
} from './protocol'
import { JSON_RPC_VERSION, MCP_PROTOCOL_VERSION } from './protocol'
import type { Transport } from './transport'

const CLIENT_INFO = { name: 'orchentra-cli', version: '0.2.0' }
const CLIENT_CAPABILITIES: Record<string, unknown> = { tools: {} }

export interface McpClientOptions {
  readonly transport: Transport
  readonly defaultTimeoutMs: number
}

export class McpClient {
  private readonly transport: Transport
  private readonly defaultTimeoutMs: number
  private nextId = 1
  private initializedResult: McpInitializeResult | null = null

  constructor(options: McpClientOptions) {
    this.transport = options.transport
    this.defaultTimeoutMs = options.defaultTimeoutMs
  }

  async connect(): Promise<McpInitializeResult> {
    await this.transport.start()
    const result = await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: CLIENT_CAPABILITIES,
      clientInfo: CLIENT_INFO,
    })
    const initResult = result as McpInitializeResult
    this.initializedResult = initResult
    await this.notify('notifications/initialized')
    return initResult
  }

  async listTools(): Promise<McpToolSpec[]> {
    const result = await this.request('tools/list')
    const typed = result as { tools?: unknown }
    if (!Array.isArray(typed.tools)) return []
    return typed.tools
      .filter((entry): entry is McpToolSpec => isValidToolSpec(entry))
      .map((entry) => ({
        name: entry.name,
        description: entry.description,
        inputSchema: entry.inputSchema,
      }))
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<McpToolsCallResult> {
    const result = await this.request('tools/call', { name, arguments: args }, timeoutMs ?? this.defaultTimeoutMs)
    return coerceCallResult(result)
  }

  async close(): Promise<void> {
    await this.transport.close()
  }

  serverInfo(): McpInitializeResult | null {
    return this.initializedResult
  }

  private async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    const id = this.nextId++
    const request: JsonRpcRequest = { jsonrpc: JSON_RPC_VERSION, id, method, params }
    const response = await this.transport.send(request, timeoutMs ?? this.defaultTimeoutMs)
    if ('error' in response) {
      const err = response.error
      throw new Error(`MCP ${method} error ${err.code}: ${err.message}`)
    }
    return (response as { result: unknown }).result
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const notification: JsonRpcNotification = { jsonrpc: JSON_RPC_VERSION, method, params }
    await this.transport.sendNotification(notification)
  }
}

export function isValidToolSpec(value: unknown): value is McpToolSpec {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || v.name.length === 0) return false
  if (typeof v.inputSchema !== 'object' || v.inputSchema === null) return false
  return true
}

function coerceCallResult(value: unknown): McpToolsCallResult {
  if (typeof value !== 'object' || value === null) {
    return { content: [{ type: 'text', text: String(value) }], isError: true }
  }
  const v = value as { content?: unknown; isError?: unknown }
  const content = Array.isArray(v.content) ? (v.content as McpToolsCallResult['content']) : []
  return {
    content,
    isError: typeof v.isError === 'boolean' ? v.isError : false,
  }
}

export type { JsonRpcResponse }
