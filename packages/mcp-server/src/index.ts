import {
  dispatch,
  OperationError,
  type Operation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'

export interface StartStdioServerOpts {
  /** Override stdin/stdout for tests. Defaults to process.stdin / process.stdout. */
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
  /**
   * Optional hook for test wiring (e.g., installing the GitHub adapter before
   * the server starts handling JSON-RPC frames).
   */
  beforeServe?: () => void | Promise<void>
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * Boots a stdio MCP-shaped JSON-RPC server. Stub framing: newline-delimited
 * JSON, one request per line. The full @modelcontextprotocol/sdk integration
 * with Content-Length framing lands in the foundation slice (#290); this stub
 * is just enough to round-trip tools/list and tools/call for the 5 ops.
 */
export async function startStdioServer(operations: Operation[], opts: StartStdioServerOpts = {}): Promise<void> {
  const input = opts.input ?? process.stdin
  const output = opts.output ?? process.stdout

  if (opts.beforeServe) await opts.beforeServe()

  const allowedScopes = new Set<OperationScope>(['read'])
  const ctx: OperationContext = { remote: true, allowedScopes }

  const opsById = new Map(operations.map((op) => [op.id, op]))

  const write = (msg: JsonRpcResponse): void => {
    output.write(JSON.stringify(msg) + '\n')
  }

  const handle = async (req: JsonRpcRequest): Promise<void> => {
    if (req.method === 'initialize') {
      write({
        jsonrpc: '2.0',
        id: req.id ?? null,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
        },
      })
      return
    }

    if (req.method === 'tools/list') {
      const tools = operations.map((op) => ({
        name: op.id,
        description: op.description,
        inputSchema: zodToJsonSchema(op.parameters),
      }))
      write({ jsonrpc: '2.0', id: req.id ?? null, result: { tools } })
      return
    }

    if (req.method === 'tools/call') {
      const params = (req.params ?? {}) as { name?: string; arguments?: unknown }
      const op = params.name ? opsById.get(params.name) : undefined
      if (!op) {
        write({
          jsonrpc: '2.0',
          id: req.id ?? null,
          result: {
            isError: true,
            content: [{ type: 'text', text: `unknown tool: ${params.name ?? '<missing>'}` }],
          },
        })
        return
      }
      try {
        const result = await dispatch(op, ctx, params.arguments)
        write({
          jsonrpc: '2.0',
          id: req.id ?? null,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          },
        })
      } catch (err) {
        const errBody =
          err instanceof OperationError
            ? err.toJSON()
            : { code: 'unknown', message: err instanceof Error ? err.message : String(err) }
        write({
          jsonrpc: '2.0',
          id: req.id ?? null,
          result: {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify(errBody) }],
          },
        })
      }
      return
    }

    write({
      jsonrpc: '2.0',
      id: req.id ?? null,
      error: { code: -32601, message: `method not found: ${req.method}` },
    })
  }

  let buffer = ''
  // process.stdin / generic ReadableStream both expose Node's EventEmitter
  // shape at runtime; cast through a minimal interface so the stub stays
  // transport-agnostic.
  interface StreamLike {
    setEncoding?: (enc: string) => void
    on: (event: string, cb: (arg: unknown) => void) => void
  }
  const stream = input as unknown as StreamLike

  return new Promise<void>((resolve, reject) => {
    stream.setEncoding?.('utf-8')
    stream.on('data', (chunk: unknown) => {
      buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk as ArrayBufferLike).toString('utf-8')
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line) continue
        try {
          const req = JSON.parse(line) as JsonRpcRequest
          void handle(req)
        } catch (err) {
          write({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: `parse error: ${err instanceof Error ? err.message : String(err)}` },
          })
        }
      }
    })
    stream.on('end', () => resolve())
    stream.on('error', (err: unknown) => reject(err))
  })
}

/**
 * Tiny Zod-to-JSON-Schema shim covering the shapes used by the migrated read
 * ops (z.object with string/number/optional fields). The real foundation
 * (#290) will swap this for zod-to-json-schema.
 */
function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown> } })._def
  if (!def || def.typeName !== 'ZodObject' || !def.shape) {
    return { type: 'object' }
  }
  const shape = def.shape()
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, value] of Object.entries(shape)) {
    const valDef = (value as { _def?: { typeName?: string; description?: string; innerType?: unknown } })._def
    let optional = false
    let innerDef = valDef
    if (innerDef?.typeName === 'ZodOptional') {
      optional = true
      innerDef = (innerDef.innerType as { _def?: typeof valDef })._def
    }
    let type: string = 'string'
    if (innerDef?.typeName === 'ZodNumber') type = 'number'
    else if (innerDef?.typeName === 'ZodBoolean') type = 'boolean'
    properties[key] = { type, description: valDef?.description }
    if (!optional) required.push(key)
  }
  return { type: 'object', properties, required }
}
