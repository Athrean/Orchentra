import type { Operation, OperationContext } from './types'
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

  const isMutating = operation.scope === 'write' || operation.scope === 'admin'

  const parsed = operation.parameters.safeParse(params)
  if (!parsed.success) {
    throw new OperationError({
      code: 'invalid_input',
      message: `invalid parameters for ${operation.id}: ${parsed.error.message}`,
    })
  }

  if (isMutating && ctx.remote !== false) {
    const approval = typeof ctx.approval === 'function' ? ctx.approval : null
    if (!approval) {
      throw new OperationError({
        code: 'permission_denied',
        message: `operation ${operation.id} requires explicit approval when invoked by a remote caller`,
        suggestion: 'invoke this operation locally, or wire an approval callback on OperationContext',
      })
    }
    let approved = false
    try {
      approved = await approval(operation, parsed.data)
    } catch (err) {
      throw new OperationError({
        code: 'permission_denied',
        message: `approval callback for ${operation.id} threw: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
    if (!approved) {
      throw new OperationError({
        code: 'permission_denied',
        message: `operation ${operation.id} was not approved by the configured approval callback`,
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
