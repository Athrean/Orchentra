import { requiresApproval } from './trust'
import type { ApprovalCallbackResult, ApprovalDecisionResult, Operation, OperationContext } from './types'
import { OperationError } from './types'

/**
 * Single shared invocation path for every transport. Validates params against
 * the operation's Zod schema, enforces the trust boundary, then runs the
 * handler. All `OperationError`s thrown by the handler propagate verbatim;
 * other thrown values are wrapped in `internal_error`.
 */
export async function dispatch<TParams, TResult>(
  operation: Operation<TParams, TResult>,
  ctx: OperationContext,
  params: unknown,
): Promise<TResult> {
  if (operation.localOnly && ctx.remote !== false) {
    throw new OperationError({
      code: 'permission_denied',
      message: `operation ${operation.id} is local-only and cannot be invoked by a remote caller`,
    })
  }

  const parsed = operation.parameters.safeParse(params)
  if (!parsed.success) {
    throw new OperationError({
      code: 'invalid_input',
      message: `invalid parameters for ${operation.id}: ${parsed.error.message}`,
    })
  }

  if (requiresApproval(operation, ctx)) {
    const approval = typeof ctx.approval === 'function' ? ctx.approval : null
    if (!approval) {
      throw new OperationError({
        code: 'permission_denied',
        message: `operation ${operation.id} requires explicit approval when invoked by a remote caller`,
        suggestion: 'invoke this operation locally, or wire an approval callback on OperationContext',
      })
    }
    let raw: ApprovalCallbackResult
    try {
      raw = await approval(operation, parsed.data)
    } catch (err) {
      throw new OperationError({
        code: 'permission_denied',
        message: `approval callback for ${operation.id} threw: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
    const decision = normalizeDecision(raw)
    if (decision.status === 'denied') {
      throw new OperationError({
        code: 'permission_denied',
        message: decision.reason ?? `operation ${operation.id} was not approved`,
      })
    }
    if (decision.status === 'awaiting_approval') {
      // The transport — not the dispatcher — owns surfacing this back to the
      // caller. We still throw so the handler does not run on this call.
      throw new OperationError({
        code: 'awaiting_approval',
        message: decision.reason ?? `operation ${operation.id} is awaiting approval`,
        suggestion: decision.approvalId
          ? `re-invoke once approval ${decision.approvalId} resolves, or POST /api/approvals/${decision.approvalId}/ack`
          : undefined,
        ...(decision.approvalId !== undefined || decision.expiresAt !== undefined
          ? { docs: JSON.stringify({ approvalId: decision.approvalId, expiresAt: decision.expiresAt }) }
          : {}),
      })
    }
  }

  try {
    return await operation.handler(ctx, parsed.data)
  } catch (err) {
    if (err instanceof OperationError) throw err
    throw new OperationError({
      code: 'internal_error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function normalizeDecision(raw: ApprovalCallbackResult): ApprovalDecisionResult {
  if (typeof raw === 'boolean') return { status: raw ? 'approved' : 'denied' }
  return raw
}
