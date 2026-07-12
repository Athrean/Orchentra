import { describe, expect, test } from 'bun:test'
import { validateToolArgs } from '../src/runtime/arg-validation'

const schema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    offset: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    recursive: { type: 'boolean' },
    mode: { type: 'string', enum: ['fast', 'slow'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['path'],
  additionalProperties: false,
}

describe('validateToolArgs', () => {
  test('valid args pass', () => {
    expect(validateToolArgs(schema, { path: '/a', offset: 0, recursive: true, mode: 'fast', tags: ['x'] })).toEqual([])
  })

  test('missing required field', () => {
    expect(validateToolArgs(schema, { offset: 1 })).toEqual(["missing required field 'path'"])
  })

  test('wrong primitive type', () => {
    expect(validateToolArgs(schema, { path: 42 })).toEqual(['path: expected string, got number'])
  })

  test('non-integer where integer declared', () => {
    expect(validateToolArgs(schema, { path: '/a', offset: 1.5 })).toEqual(['offset: expected integer, got number'])
  })

  test('minimum enforced', () => {
    expect(validateToolArgs(schema, { path: '/a', limit: 0 })).toEqual(['limit: must be >= 1'])
  })

  test('enum enforced', () => {
    expect(validateToolArgs(schema, { path: '/a', mode: 'warp' })).toEqual(['mode: must be one of "fast", "slow"'])
  })

  test('array item types enforced', () => {
    expect(validateToolArgs(schema, { path: '/a', tags: ['ok', 7] })).toEqual(['tags[1]: expected string, got number'])
  })

  test('unknown field rejected when additionalProperties is false', () => {
    expect(validateToolArgs(schema, { path: '/a', bogus: 1 })).toEqual(["unknown field 'bogus'"])
  })

  test('unknown field tolerated when additionalProperties is not false', () => {
    const open = { ...schema, additionalProperties: undefined }
    expect(validateToolArgs(open, { path: '/a', extra: 1 })).toEqual([])
  })

  test('non-object args rejected', () => {
    expect(validateToolArgs(schema, 'path=/a')).toEqual(['arguments must be an object, got string'])
    expect(validateToolArgs(schema, ['a'])).toEqual(['arguments must be an object, got array'])
  })

  test('undefined args count as {} — ok without required fields, rejected with', () => {
    const noRequired = { type: 'object', properties: { command: { type: 'string' } }, additionalProperties: false }
    expect(validateToolArgs(noRequired, undefined)).toEqual([])
    expect(validateToolArgs(schema, undefined)).toEqual(["missing required field 'path'"])
  })

  test('multiple problems reported together', () => {
    const problems = validateToolArgs(schema, { offset: 'zero', bogus: true })
    expect(problems).toContain("missing required field 'path'")
    expect(problems).toContain('offset: expected integer, got string')
    expect(problems).toContain("unknown field 'bogus'")
  })

  test('non-object schemas are permissive', () => {
    expect(validateToolArgs({}, 'anything')).toEqual([])
    expect(validateToolArgs({ type: 'string' }, 42)).toEqual([])
  })
})
