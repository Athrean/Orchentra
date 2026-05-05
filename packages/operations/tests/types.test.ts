import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { OperationError, type Operation, type OperationContext } from '../src'

describe('OperationContext', () => {
  test('requires remote at the type level (compile-time check)', () => {
    // The following type-level check fails to compile if `remote` becomes optional.
    // The runtime body just exercises that constructed values flow through.
    const ctx: OperationContext = { remote: false, allowedScopes: new Set(['read']) }
    expect(ctx.remote).toBe(false)

    // @ts-expect-error remote is REQUIRED — omitting it must fail to type-check
    const bad: OperationContext = { allowedScopes: new Set(['read']) }
    expect(bad.allowedScopes.size).toBe(1)
  })
})

describe('Operation', () => {
  test('shape carries id, scope, parameters, handler', async () => {
    const op: Operation<{ greeting: string }, string> = {
      id: 'test_op',
      description: 'echoes input',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.object({ greeting: z.string() }),
      handler: async (_ctx, params) => params.greeting,
    }

    const result = await op.handler({ remote: false, allowedScopes: new Set(['read']) }, { greeting: 'hi' })
    expect(result).toBe('hi')
  })
})

describe('OperationError', () => {
  test('serializes to a stable JSON shape with code + message', () => {
    const err = new OperationError({
      code: 'invalid_input',
      message: 'parameter `name` is required',
    })
    expect(err.toJSON()).toEqual({
      code: 'invalid_input',
      message: 'parameter `name` is required',
    })
  })

  test('serializes optional suggestion and docs when present', () => {
    const err = new OperationError({
      code: 'permission_denied',
      message: 'remote callers cannot invoke write-scoped operations without approval',
      suggestion: 'request human approval first',
      docs: 'https://orchentra.dev/docs/trust-model',
    })
    expect(err.toJSON()).toEqual({
      code: 'permission_denied',
      message: 'remote callers cannot invoke write-scoped operations without approval',
      suggestion: 'request human approval first',
      docs: 'https://orchentra.dev/docs/trust-model',
    })
  })
})
