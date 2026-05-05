import { describe, expect, test } from 'bun:test'
import {
  OperationError,
  INTERNAL_ERROR_CODE,
  dispatch,
  serializeOperationErrorForCli,
  type Operation,
} from '@orchentra/operations'
import { serializeOperationErrorForMcp } from '../src/serialize'

/**
 * The CLI side writes `JSON.stringify(toJSON()) + '\n'` so the body
 * stays line-flushed; the MCP `text` field is the same JSON without
 * the trailing newline. Strip the newline before comparing bytes.
 */
function cliBodyJson(err: OperationError): string {
  return serializeOperationErrorForCli(err).body.trimEnd()
}

function mcpBodyJson(err: OperationError): string {
  const response = serializeOperationErrorForMcp(err)
  return response.content[0].text
}

const opErrorOp: Operation<unknown, never> = {
  id: 'parity.op-error',
  handler: async () => {
    throw new OperationError(
      'invalid_params',
      'foo must be a string',
      'pass a string',
      'https://docs.orchentra.dev/errors/invalid_params',
    )
  },
}

const genericErrorOp: Operation<unknown, never> = {
  id: 'parity.generic-error',
  handler: async () => {
    throw new Error('boom')
  },
}

describe('error serialization parity across CLI and MCP transports', () => {
  test('OperationError thrown by a handler serializes byte-identically through both transports', async () => {
    const cliResult = await dispatch(opErrorOp, { remote: false }, undefined)
    const mcpResult = await dispatch(opErrorOp, { remote: true }, undefined)
    expect(cliResult.ok).toBe(false)
    expect(mcpResult.ok).toBe(false)
    if (cliResult.ok || mcpResult.ok) return
    const cliBody = cliBodyJson(cliResult.error)
    const mcpBody = mcpBodyJson(mcpResult.error)
    expect(cliBody).toBe(mcpBody)
    expect(JSON.parse(cliBody)).toEqual(JSON.parse(mcpBody))
    expect(JSON.parse(cliBody)).toEqual({
      code: 'invalid_params',
      message: 'foo must be a string',
      suggestion: 'pass a string',
      docs: 'https://docs.orchentra.dev/errors/invalid_params',
    })
  })

  test('generic Error thrown by a handler is wrapped to internal_error and parity-serialized', async () => {
    const cliResult = await dispatch(genericErrorOp, { remote: false }, undefined)
    const mcpResult = await dispatch(genericErrorOp, { remote: true }, undefined)
    expect(cliResult.ok).toBe(false)
    expect(mcpResult.ok).toBe(false)
    if (cliResult.ok || mcpResult.ok) return
    const cliBody = cliBodyJson(cliResult.error)
    const mcpBody = mcpBodyJson(mcpResult.error)
    expect(cliBody).toBe(mcpBody)
    expect(JSON.parse(cliBody)).toEqual({
      code: INTERNAL_ERROR_CODE,
      message: 'boom',
    })
  })

  test('parity holds for the minimum-fields OperationError (no suggestion, no docs)', async () => {
    const minOp: Operation<unknown, never> = {
      id: 'parity.min-error',
      handler: async () => {
        throw new OperationError('rate_limited', 'too many calls')
      },
    }
    const cliResult = await dispatch(minOp, { remote: false }, undefined)
    const mcpResult = await dispatch(minOp, { remote: true }, undefined)
    if (cliResult.ok || mcpResult.ok) {
      throw new Error('expected both dispatches to fail')
    }
    expect(cliBodyJson(cliResult.error)).toBe(mcpBodyJson(mcpResult.error))
  })

  // TODO(post-#290 merge): boot the real stdio MCP server in a subprocess
  // and run the same parity assertion against a true tools/call response
  // body coming over JSON-RPC. The boundary-level test above asserts
  // byte equality at the same serialization functions both transports
  // call into, so end-to-end parity follows from the test below
  // running green plus the subprocess test in #290 confirming the MCP
  // server uses these helpers.
})
