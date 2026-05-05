import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  dispatch,
  OperationError,
  type Operation,
  type OperationContext,
  type OperationScope,
} from '@orchentra/operations'
import {
  JSON_RPC_VERSION,
  MCP_PROTOCOL_VERSION,
  type IncomingMessage,
  type JsonRpcResponse,
  type ServerInfo,
} from './protocol'

export interface HandleRpcDeps {
  operations: Operation[]
  serverInfo: ServerInfo
}

/**
 * Construct a fresh OperationContext per RPC call. A shared mutable ctx would
 * let one in-flight request mutate `remote` or `allowedScopes` and bypass the
 * trust-boundary check on a concurrent request.
 */
function buildRemoteCtx(): OperationContext {
  return {
    remote: true,
    allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
  }
}

/**
 * Process a single inbound JSON-RPC message and produce the response payload.
 * Returns null when no response is required (notifications). Pure: no I/O.
 */
export async function handleRpc(message: IncomingMessage, deps: HandleRpcDeps): Promise<JsonRpcResponse | null> {
  if (!('id' in message) || message.id === undefined) {
    return null
  }
  const { id, method } = message

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: deps.serverInfo,
      })

    case 'tools/list':
      return ok(id, { tools: deps.operations.map(toToolSpec) })

    case 'tools/call': {
      const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown }
      const name = typeof params.name === 'string' ? params.name : null
      if (!name) return invalidParams(id, 'tools/call: missing tool name')

      const op = deps.operations.find((o) => o.id === name)
      if (!op) return invalidParams(id, `tools/call: unknown tool '${name}'`)

      try {
        const result = await dispatch(op, buildRemoteCtx(), params.arguments ?? {})
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: false,
        })
      } catch (err) {
        const payload =
          err instanceof OperationError
            ? err.toJSON()
            : { code: 'internal_error', message: err instanceof Error ? err.message : String(err) }
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          isError: true,
        })
      }
    }

    default:
      return {
        jsonrpc: JSON_RPC_VERSION,
        id,
        error: { code: -32601, message: `method not found: ${method}` },
      }
  }
}

function ok(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, result }
}

function invalidParams(id: number | string, message: string): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code: -32602, message } }
}

function toToolSpec(op: Operation): { name: string; description: string; inputSchema: Record<string, unknown> } {
  const inputSchema = zodToJsonSchema(op.parameters, { $refStrategy: 'none' }) as Record<string, unknown>
  delete inputSchema.$schema
  return {
    name: op.id,
    description: op.description,
    inputSchema,
  }
}
