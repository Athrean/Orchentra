import { describe, expect, test } from 'bun:test'
import { McpClient } from '../src/mcp/client'
import type { Transport, TransportStatus } from '../src/mcp/transport'
import type { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from '../src/mcp/protocol'

class FakeTransport implements Transport {
  public sent: JsonRpcRequest[] = []
  public notifications: JsonRpcNotification[] = []
  private handlers: Map<string, (req: JsonRpcRequest) => JsonRpcResponse> = new Map()
  private state: TransportStatus['state'] = 'idle'

  route(method: string, handler: (req: JsonRpcRequest) => JsonRpcResponse): void {
    this.handlers.set(method, handler)
  }

  async start(): Promise<void> {
    this.state = 'open'
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.sent.push(request)
    const handler = this.handlers.get(request.method)
    if (!handler) {
      return { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'method not found' } }
    }
    return handler(request)
  }

  async sendNotification(notification: JsonRpcNotification): Promise<void> {
    this.notifications.push(notification)
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }

  status(): TransportStatus {
    return { state: this.state }
  }
}

describe('McpClient', () => {
  test('connect performs initialize handshake and sends initialized notification', async () => {
    const transport = new FakeTransport()
    transport.route('initialize', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake', version: '1.0' },
      },
    }))
    const client = new McpClient({ transport, defaultTimeoutMs: 1_000 })
    const result = await client.connect()
    expect(result.serverInfo.name).toBe('fake')
    expect(transport.notifications.some((n) => n.method === 'notifications/initialized')).toBe(true)
    await client.close()
  })

  test('listTools parses and filters valid specs', async () => {
    const transport = new FakeTransport()
    transport.route('initialize', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'f', version: '1' } },
    }))
    transport.route('tools/list', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: [
          { name: 'good', description: 'd', inputSchema: { type: 'object' } },
          { name: '', inputSchema: {} },
          { inputSchema: {} },
          { name: 'no_schema' },
        ],
      },
    }))
    const client = new McpClient({ transport, defaultTimeoutMs: 1_000 })
    await client.connect()
    const tools = await client.listTools()
    expect(tools.length).toBe(1)
    expect(tools[0].name).toBe('good')
    await client.close()
  })

  test('callTool throws a descriptive error when server returns error', async () => {
    const transport = new FakeTransport()
    transport.route('initialize', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'f', version: '1' } },
    }))
    transport.route('tools/call', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32000, message: 'tool exploded' },
    }))
    const client = new McpClient({ transport, defaultTimeoutMs: 1_000 })
    await client.connect()
    await expect(client.callTool('x', {})).rejects.toThrow('tool exploded')
    await client.close()
  })

  test('callTool returns content + isError from server', async () => {
    const transport = new FakeTransport()
    transport.route('initialize', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'f', version: '1' } },
    }))
    transport.route('tools/call', (req) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { content: [{ type: 'text', text: 'ok' }], isError: false },
    }))
    const client = new McpClient({ transport, defaultTimeoutMs: 1_000 })
    await client.connect()
    const result = await client.callTool('x', {})
    expect(result.content.length).toBe(1)
    expect(result.isError).toBe(false)
    await client.close()
  })
})
