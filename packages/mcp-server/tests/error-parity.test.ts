import { describe, expect, test } from 'bun:test'
import {
  OperationError,
  dispatch,
  serializeOperationErrorForCli,
  toOperationError,
  type Operation,
  type OperationContext,
} from '@orchentra/operations'
import { z } from 'zod'
import { serializeOperationErrorForMcp } from '../src/serialize'

const baseCtx: OperationContext = {
  remote: false,
  allowedScopes: new Set(['read']),
}

const opErrorOp: Operation<unknown, never> = {
  id: 'parity.op-error',
  description: 'parity test',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters: z.unknown(),
  handler: async () => {
    throw new OperationError({
      code: 'invalid_input',
      message: 'foo must be a string',
      suggestion: 'pass a string',
      docs: 'https://docs.orchentra.dev/errors/invalid_input',
    })
  },
}

const genericErrorOp: Operation<unknown, never> = {
  id: 'parity.generic-error',
  description: 'parity test',
  scope: 'read',
  localOnly: false,
  mutating: false,
  parameters: z.unknown(),
  handler: async () => {
    throw new Error('boom')
  },
}

async function captureError(op: Operation<unknown, never>): Promise<OperationError> {
  try {
    await dispatch(op, baseCtx, undefined)
  } catch (err) {
    return toOperationError(err)
  }
  throw new Error('expected dispatch to fail')
}

function cliBody(err: OperationError): string {
  return serializeOperationErrorForCli(err).body.trimEnd()
}

function mcpBody(err: OperationError): string {
  return serializeOperationErrorForMcp(err).content[0].text
}

describe('error serialization parity across CLI and MCP transports', () => {
  test('OperationError thrown by a handler serializes byte-identically through both transports', async () => {
    const err = await captureError(opErrorOp)
    expect(cliBody(err)).toBe(mcpBody(err))
    expect(JSON.parse(cliBody(err))).toEqual({
      code: 'invalid_input',
      message: 'foo must be a string',
      suggestion: 'pass a string',
      docs: 'https://docs.orchentra.dev/errors/invalid_input',
    })
  })

  test('generic Error is wrapped to internal_error and parity-serialized', async () => {
    const err = await captureError(genericErrorOp)
    expect(cliBody(err)).toBe(mcpBody(err))
    expect(JSON.parse(cliBody(err))).toEqual({
      code: 'internal_error',
      message: 'boom',
    })
  })

  test('parity holds for the minimum-fields OperationError (no suggestion, no docs)', async () => {
    const minOp: Operation<unknown, never> = {
      id: 'parity.min-error',
      description: 'parity test',
      scope: 'read',
      localOnly: false,
      mutating: false,
      parameters: z.unknown(),
      handler: async () => {
        throw new OperationError({ code: 'upstream_error', message: 'too many calls' })
      },
    }
    const err = await captureError(minOp)
    expect(cliBody(err)).toBe(mcpBody(err))
  })
})
