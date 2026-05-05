import { Hono } from 'hono'
import { mountMcpRoutes } from '@orchentra/mcp-server'
import { operations } from '@orchentra/operations'

export interface Env {
  ORG_SESSION: DurableObjectNamespace
  ORCHENTRA_MCP_NAME?: string
  ORCHENTRA_MCP_VERSION?: string
}

/**
 * Construct the Hono app that backs the worker. Exported so the smoke test
 * can call it without a full miniflare/wrangler runtime.
 *
 * For the scaffold, a single static approval callback short-circuits to
 * `true` for orgs in the smoke allowlist. Phase 1C swaps this for a
 * per-request lookup against the OrgSession Durable Object so individual
 * `<orgId, opId>` approvals can be granted and revoked at runtime.
 */
export function buildApp(): Hono {
  const app = new Hono()

  mountMcpRoutes(app, {
    operations,
    serverInfo: { name: 'orchentra-mcp', version: '0.1.0' },
    approval: async (_op, _params) => {
      // Scaffold-only: org allowlist is enforced at request time by reading
      // x-orchentra-org. The HTTP handler has already validated the header is
      // present; here we just decide approve/reject. Real per-op gating moves
      // into the Durable Object lookup in Phase 1C.
      return true
    },
  })

  app.get('/', (c) => c.text('orchentra-mcp-host (Phase 1B scaffold)'))

  return app
}

const app = buildApp()

export default {
  fetch(req: Request, _env: Env, _ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(req)
  },
}

export { OrgSession } from './durable-objects/session'
