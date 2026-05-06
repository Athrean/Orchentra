import type { ApprovalCallback, ApprovalCallbackResult } from '@orchentra/operations'
import { resolveTrustClass } from '@orchentra/operations'

/**
 * Approval persistence seam for the MCP HTTP transport.
 *
 * The mcp-server package stays portable — it does NOT import from
 * `apps/server`. The host (apps/server, the hosted Cloudflare Worker, or a
 * test harness) injects an `ApprovalPort` implementation backed by its own
 * persistence layer. Phase 1B's apps/server implementation is in
 * `apps/server/src/approvals/mcp-port.ts`.
 *
 * The contract is intentionally minimal: given an op + parsed input + the
 * request-time context (org, requesting actor), persist a pending row and
 * return its id + expiry. The dispatcher then surfaces `awaiting_approval`
 * to the caller — there is no long-poll on the HTTP request itself.
 */
export interface ApprovalPort {
  requestApproval(input: ApprovalRequestInput): Promise<{ approvalId: string; expiresAt: string }>
}

export interface ApprovalRequestInput {
  orgId: string
  operationId: string
  trustClass: 'read' | 'write' | 'destructive'
  /** Zod-validated input. The host is responsible for redacting secrets. */
  input: unknown
  requestedBy: { id: string; type?: 'user' | 'agent' | 'system' }
}

/**
 * Build an `ApprovalCallback` (the dispatcher's gate hook) from an
 * `ApprovalPort` + the per-request context. Each call persists a fresh
 * row and returns `awaiting_approval` so the dispatcher throws a structured
 * error the transport can serialize back to the caller.
 */
export function buildApprovalCallbackFromPort(
  port: ApprovalPort,
  ctx: { orgId: string; requestedBy: { id: string; type?: 'user' | 'agent' | 'system' } },
): ApprovalCallback {
  return async (op, params): Promise<ApprovalCallbackResult> => {
    const trustClass = resolveTrustClass(op)
    const { approvalId, expiresAt } = await port.requestApproval({
      orgId: ctx.orgId,
      operationId: op.id,
      trustClass,
      input: params,
      requestedBy: ctx.requestedBy,
    })
    return {
      status: 'awaiting_approval',
      approvalId,
      expiresAt,
      reason: `operation ${op.id} requires human approval`,
    }
  }
}
