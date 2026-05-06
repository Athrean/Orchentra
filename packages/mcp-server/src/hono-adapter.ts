import type { Hono } from 'hono'
import { handleHttpRpc, type HandleHttpRpcDeps } from './http-handler'

export interface MountMcpRoutesOptions extends HandleHttpRpcDeps {
  /** Path prefix for the MCP endpoint. Defaults to `/mcp`. */
  path?: string
}

/**
 * Mount the HTTP MCP transport on a supplied Hono app. Registers two routes:
 *   - `POST <path>`: dispatches JSON-RPC messages through `handleHttpRpc`.
 *   - `GET <path>/health`: returns server info for liveness probes.
 *
 * `apps/server` and the hosted Cloudflare Worker can both consume this; the
 * function is transport-agnostic so the choice of runtime stays at the edge.
 */
export function mountMcpRoutes(app: Hono, options: MountMcpRoutesOptions): void {
  const path = options.path ?? '/mcp'
  const deps: HandleHttpRpcDeps = {
    operations: options.operations,
    serverInfo: options.serverInfo,
    approval: options.approval,
    approvalPort: options.approvalPort,
  }

  app.post(path, async (c) => {
    return handleHttpRpc(c.req.raw, deps)
  })

  app.get(`${path}/health`, (c) => {
    return c.json({ status: 'ok', serverInfo: deps.serverInfo })
  })
}
