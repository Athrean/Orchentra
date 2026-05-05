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

  if ((operation.scope === 'write' || operation.scope === 'admin') && ctx.remote !== false) {
    throw new OperationError({
      code: 'permission_denied',
      message: `operation ${operation.id} requires explicit approval when invoked by a remote caller`,
      suggestion: 'invoke this operation locally, or wire an approval gate',
    })
  }

  const parsed = operation.parameters.safeParse(params)
  if (!parsed.success) {
    throw new OperationError({
      code: 'invalid_input',
      message: `invalid parameters for ${operation.id}: ${parsed.error.message}`,
    })
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
