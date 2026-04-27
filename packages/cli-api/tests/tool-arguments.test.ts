import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { parseToolArguments } from '../src/tool-arguments'

let stderrCalls: string[] = []
let originalWrite: typeof process.stderr.write

beforeEach(() => {
  stderrCalls = []
  originalWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: unknown) => {
    stderrCalls.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }) as typeof process.stderr.write
})

afterEach(() => {
  process.stderr.write = originalWrite
})

describe('parseToolArguments', () => {
  test('parses valid JSON object', () => {
    const result = parseToolArguments('{"path":"/tmp/a","mode":"r"}', 'read_file')
    expect(result.args).toEqual({ path: '/tmp/a', mode: 'r' })
    expect(result.recovered).toBe(false)
    expect(stderrCalls.length).toBe(0)
  })

  test('returns empty object for empty/whitespace input', () => {
    expect(parseToolArguments('', 'x').args).toEqual({})
    expect(parseToolArguments('   ', 'x').args).toEqual({})
    expect(parseToolArguments(null, 'x').args).toEqual({})
    expect(parseToolArguments(undefined, 'x').args).toEqual({})
  })

  test('recovers from JSON wrapped in ```json fence', () => {
    const result = parseToolArguments('```json\n{"x":1}\n```', 'tool')
    expect(result.args).toEqual({ x: 1 })
    expect(result.recovered).toBe(true)
  })

  test('recovers from trailing commas', () => {
    const result = parseToolArguments('{"a":1,"b":2,}', 'tool')
    expect(result.args).toEqual({ a: 1, b: 2 })
    expect(result.recovered).toBe(true)
  })

  test('falls back to {} and warns when truly unparseable', () => {
    const result = parseToolArguments('not json at all <broken>', 'bash')
    expect(result.args).toEqual({})
    expect(result.error).toBe('unparseable')
    expect(stderrCalls.length).toBe(1)
    expect(stderrCalls[0]).toContain("tool 'bash'")
  })

  test('rejects arrays and primitives (must be object)', () => {
    expect(parseToolArguments('[1,2,3]', 't').args).toEqual({})
    expect(parseToolArguments('"hello"', 't').args).toEqual({})
    expect(parseToolArguments('42', 't').args).toEqual({})
  })

  test('rejects null', () => {
    expect(parseToolArguments('null', 't').args).toEqual({})
  })
})
