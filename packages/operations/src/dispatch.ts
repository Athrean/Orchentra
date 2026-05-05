import type { Operation, OperationContext } from './types'

/**
 * Run an operation under the trust gate.
 *
 * In 1A this is intentionally minimal — it just calls the handler. The
 * trust gate is added by the next commit, in TDD red→green order. The
 * separation is deliberate so the failing test that motivates the gate
 * lives in git history.
 */
export async function dispatch<TParams, TResult>(
  op: Operation<TParams, TResult>,
  ctx: OperationContext,
  params: TParams,
): Promise<TResult> {
  const parsed = op.parameters.parse(params)
  return op.handler(ctx, parsed)
}
