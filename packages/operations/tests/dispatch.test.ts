import { describe, expect, test } from 'bun:test'
import { dispatch } from '../src/dispatch'
import { OperationError, INTERNAL_ERROR_CODE } from '../src/operation-error'
import type { Operation } from '../src/types'

const okOp: Operation<{ n: number }, { doubled: number }> = {
  id: 'test.ok',
  handler: async (_ctx, params) => ({ doubled: params.n * 2 }),
}

const opErrorOp: Operation<unknown, never> = {
  id: 'test.op-error',
  handler: async () => {
    throw new OperationError('invalid_params', 'foo must be a string', 'pass a string')
  },
}

const genericErrorOp: Operation<unknown, never> = {
  id: 'test.generic-error',
  handler: async () => {
    throw new Error('boom')
  },
}

const stringThrowOp: Operation<unknown, never> = {
  id: 'test.string-throw',
  handler: async () => {
    throw 'raw string'
  },
}

describe('dispatch', () => {
  test('returns { ok: true, value } when the handler resolves', async () => {
    const result = await dispatch(okOp, { remote: false }, { n: 21 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ doubled: 42 })
  })

  test('returns { ok: false, error } preserving an OperationError thrown by the handler', async () => {
    const result = await dispatch(opErrorOp, { remote: true }, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(OperationError)
      expect(result.error.toJSON()).toEqual({
        code: 'invalid_params',
        message: 'foo must be a string',
        suggestion: 'pass a string',
      })
    }
  })

  test('wraps a generic Error into an OperationError with the internal_error code', async () => {
    const result = await dispatch(genericErrorOp, { remote: false }, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.toJSON()).toEqual({
        code: INTERNAL_ERROR_CODE,
        message: 'boom',
      })
    }
  })

  test('wraps a thrown non-Error value (string) into an OperationError', async () => {
    const result = await dispatch(stringThrowOp, { remote: false }, undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.toJSON()).toEqual({
        code: INTERNAL_ERROR_CODE,
        message: 'raw string',
      })
    }
  })
})
