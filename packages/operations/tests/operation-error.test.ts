import { describe, expect, test } from 'bun:test'
import { OperationError } from '../src'

describe('OperationError', () => {
  test('serializes to a stable JSON shape with optional fields preserved', () => {
    const err = new OperationError({
      code: 'permission_denied',
      message: 'nope',
      suggestion: 'try locally',
      docs: 'https://example.test/docs',
    })

    expect(err.toJSON()).toEqual({
      code: 'permission_denied',
      message: 'nope',
      suggestion: 'try locally',
      docs: 'https://example.test/docs',
    })
  })

  test('omits optional fields when not provided', () => {
    const err = new OperationError({ code: 'invalid_input', message: 'bad params' })

    expect(err.toJSON()).toEqual({ code: 'invalid_input', message: 'bad params' })
  })

  test('is an Error subclass with the supplied message', () => {
    const err = new OperationError({ code: 'internal_error', message: 'boom' })

    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })
})
