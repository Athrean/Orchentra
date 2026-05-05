import { describe, expect, test } from 'bun:test'
import { serializeOperationErrorForCli } from '../src/cli-serialize'
import { OperationError } from '../src/operation-error'

describe('serializeOperationErrorForCli', () => {
  test('writes the OperationError JSON body to stderr and returns a non-zero exit code', () => {
    const err = new OperationError('invalid_params', 'foo must be a string', 'pass a string')
    const result = serializeOperationErrorForCli(err)
    expect(result.stream).toBe('stderr')
    expect(result.exitCode).not.toBe(0)
    expect(JSON.parse(result.body)).toEqual({
      code: 'invalid_params',
      message: 'foo must be a string',
      suggestion: 'pass a string',
    })
  })

  test('terminates the body with a single trailing newline so stderr is line-flushed', () => {
    const err = new OperationError('internal_error', 'boom')
    const result = serializeOperationErrorForCli(err)
    expect(result.body.endsWith('\n')).toBe(true)
    expect(result.body.trimEnd()).toBe(JSON.stringify(err.toJSON()))
  })
})
