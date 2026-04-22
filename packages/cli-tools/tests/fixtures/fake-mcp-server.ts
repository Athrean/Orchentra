#!/usr/bin/env bun
// Minimal stdio MCP server used only by the integration tests.
// Implements initialize, tools/list, and one echo tool.

interface RpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: unknown
}
interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

function write(obj: RpcResponse): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function handle(req: RpcRequest): RpcResponse | null {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake-mcp-server', version: '0.0.1' },
      },
    }
  }
  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'echoes the input message',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
        ],
      },
    }
  }
  if (req.method === 'tools/call') {
    const params = (req.params ?? {}) as { name?: string; arguments?: { message?: string } }
    if (params.name !== 'echo') {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `unknown tool ${String(params.name)}` } }
    }
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        content: [{ type: 'text', text: String(params.arguments?.message ?? '') }],
        isError: false,
      },
    }
  }
  return null
}

async function main(): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of process.stdin) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true })
    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line.length > 0) {
        try {
          const msg = JSON.parse(line) as RpcRequest
          if ('id' in msg && msg.id !== undefined) {
            const response = handle(msg)
            if (response) write(response)
          }
        } catch {
          /* ignore malformed */
        }
      }
      idx = buffer.indexOf('\n')
    }
  }
}

main().catch(() => process.exit(1))
