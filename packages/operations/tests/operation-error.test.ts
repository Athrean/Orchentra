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

  test('returns { code, message, suggestion, docs } when all fields are set', () => {
    const err = new OperationError(
      'invalid_params',
      'foo must be a string',
      'Provide foo as a JSON string',
      'https://docs.orchentra.dev/errors/invalid_params',
    )
    expect(err.toJSON()).toEqual({
      code: 'invalid_params',
      message: 'foo must be a string',
      suggestion: 'Provide foo as a JSON string',
      docs: 'https://docs.orchentra.dev/errors/invalid_params',
    })
  })

  test('omits suggestion and docs when only one optional field is set', () => {
    const withSuggestion = new OperationError('rate_limited', 'too many calls', 'retry in 30s')
    expect(withSuggestion.toJSON()).toEqual({
      code: 'rate_limited',
      message: 'too many calls',
      suggestion: 'retry in 30s',
    })
    expect('docs' in withSuggestion.toJSON()).toBe(false)
  })

  test('round-trips through JSON.parse(JSON.stringify(err.toJSON())) without loss', () => {
    const err = new OperationError(
      'permission_denied',
      'write scope rejected',
      'request approval',
      'https://docs.orchentra.dev/errors/permission_denied',
    )
    const round = JSON.parse(JSON.stringify(err.toJSON()))
    expect(round).toEqual(err.toJSON())
  })

  test('does not leak internal Error fields (stack, name) into the JSON shape', () => {
    const err = new OperationError('internal_error', 'boom')
    const json = err.toJSON() as unknown as Record<string, unknown>
    expect('stack' in json).toBe(false)
    expect('name' in json).toBe(false)
    expect(Object.keys(json).sort()).toEqual(['code', 'message'])
  })
})
