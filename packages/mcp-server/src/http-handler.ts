import { OperationError, type OperationErrorPayload } from '@orchentra/operations'
import { buildApprovalCallbackFromPort, type ApprovalPort } from './approval-port'
import { handleRpc, type HandleRpcDeps } from './handle-rpc'
import type { IncomingMessage } from './protocol'

export interface HandleHttpRpcDeps extends HandleRpcDeps {
  /**
   * Optional approval persistence backend. When set, write/destructive ops
   * persist a pending row via the port and the dispatcher returns
   * `awaiting_approval` to the MCP caller — same contract as the structured
   * `ApprovalDecisionResult` in @orchentra/operations.
   *
   * The host (apps/server, hosted Worker) injects an implementation that
   * writes through to its store. The mcp-server package itself never
   * imports the store directly, so it stays portable.
   */
  approvalPort?: ApprovalPort
}

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
export async function handleHttpRpc(req: Request, deps: HandleHttpRpcDeps): Promise<Response> {
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

  let parsed: IncomingMessage
  try {
    parsed = (await req.json()) as IncomingMessage
  } catch {
    return errorResponse(400, {
      code: 'invalid_input',
      message: 'request body is not valid JSON',
    })
  }

  if (!parsed || typeof parsed.method !== 'string') {
    return errorResponse(400, {
      code: 'invalid_input',
      message: 'request body is not a valid JSON-RPC message (missing method)',
    })
  }

  // Per-request deps: when an approvalPort is configured, build an org+actor-
  // scoped approval callback that persists a pending row and returns
  // `awaiting_approval` to the dispatcher. Otherwise fall back to whatever
  // approval callback the host configured globally (or none, for stdio-style
  // fail-closed behavior).
  const requestDeps: HandleRpcDeps = deps.approvalPort
    ? {
        ...deps,
        approval: buildApprovalCallbackFromPort(deps.approvalPort, {
          orgId,
          requestedBy: { id: bearer, type: 'agent' },
        }),
      }
    : deps

  let response
  try {
    response = await handleRpc(parsed, requestDeps)
  } catch (err) {
    return errorResponse(500, {
      code: 'internal_error',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  if (response === null) {
    return new Response(null, { status: 204 })
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'content-type': 'application/json' },
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
