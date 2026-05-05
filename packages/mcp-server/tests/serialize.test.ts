import { describe, expect, test } from 'bun:test'
import { OperationError } from '@orchentra/operations'
import { serializeOperationErrorForMcp } from '../src/serialize'

describe('serializeOperationErrorForMcp', () => {
  test('returns { isError: true, content: [{ type: "text", text }] } where text is the JSON body', () => {
    const err = new OperationError({
      code: 'invalid_input',
      message: 'foo must be a string',
      suggestion: 'pass a string',
    })
    const response = serializeOperationErrorForMcp(err)
    expect(response.isError).toBe(true)
    expect(response.content.length).toBe(1)
    expect(response.content[0].type).toBe('text')
    expect(JSON.parse(response.content[0].text)).toEqual({
      code: 'invalid_input',
      message: 'foo must be a string',
      suggestion: 'pass a string',
    })
  })

  test('does not leak any extra MCP fields beyond isError + content', () => {
    const err = new OperationError({ code: 'internal_error', message: 'boom' })
    const response = serializeOperationErrorForMcp(err) as unknown as Record<string, unknown>
    expect(Object.keys(response).sort()).toEqual(['content', 'isError'])
  })
})
