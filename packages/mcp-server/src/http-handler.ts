import { OperationError, type OperationErrorPayload } from '@orchentra/operations'
import type { HandleRpcDeps } from './handle-rpc'

/**
 * HTTP transport adapter for the MCP server.
 *
 * Mirrors the stdio transport's RPC contract but adds two HTTP-only checks
 * before the request reaches `handleRpc`:
 *
 *   1. `Authorization: Bearer <token>` must be present and non-empty.
 *   2. `x-orchentra-org: <orgId>` must be present and non-empty.
 *
 * The Bearer check is intentionally minimal — it just requires the header to
 * be present with a non-empty token. Real token validation lands in Phase 1C.
 *
 * TODO(phase-1b-prod): wire real token validation against an org-scoped
 * credential store (DB or env-backed allowlist), and reject expired tokens.
 *
 * Errors serialize to the same `OperationError.toJSON()` shape as stdio so
 * downstream MCP clients see consistent payloads regardless of transport.
 */
export async function handleHttpRpc(req: Request, _deps: HandleRpcDeps): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  const bearer = parseBearer(authHeader)
  if (!bearer) {
    return errorResponse(401, {
      code: 'permission_denied',
      message: 'missing or invalid Authorization header (expected: Bearer <token>)',
      suggestion: 'set Authorization: Bearer <token> on the request',
    })
  }

  const orgId = (req.headers.get('x-orchentra-org') ?? '').trim()
  if (orgId.length === 0) {
    return errorResponse(400, {
      code: 'invalid_input',
      message: 'missing or empty x-orchentra-org header',
      suggestion: 'set x-orchentra-org: <orgId> on the request',
    })
  }

  // Slice 3 wires the request body through handleRpc.
  return errorResponse(500, {
    code: 'internal_error',
    message: 'http transport not yet wired to handleRpc',
  })
}

function parseBearer(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return null
  const token = match[1].trim()
  return token.length > 0 ? token : null
}

function errorResponse(status: number, payload: OperationErrorPayload): Response {
  const err = new OperationError(payload)
  return new Response(JSON.stringify(err.toJSON()), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
