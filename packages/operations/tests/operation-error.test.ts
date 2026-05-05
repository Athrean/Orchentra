import { describe, expect, test } from 'bun:test'
import { OperationError } from '../src/operation-error'

describe('OperationError.toJSON', () => {
  test('returns { code, message } when only code and message are set', () => {
    const err = new OperationError('invalid_params', 'foo must be a string')
    expect(err.toJSON()).toEqual({
      code: 'invalid_params',
      message: 'foo must be a string',
    })
  })
})
