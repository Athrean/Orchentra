import { describe, expect, test } from 'bun:test'
import { SseParser } from '../src/mcp/sse'

describe('SseParser', () => {
  test('parses a single event separated by a blank line', () => {
    const parser = new SseParser()
    const events = parser.push('event: message\ndata: {"a":1}\n\n')
    expect(events.length).toBe(1)
    expect(events[0].event).toBe('message')
    expect(events[0].data).toBe('{"a":1}')
  })

  test('supports multiple data lines concatenated with \\n', () => {
    const parser = new SseParser()
    const events = parser.push('data: line1\ndata: line2\n\n')
    expect(events[0].data).toBe('line1\nline2')
  })

  test('handles CRLF line endings and leading-space value trim', () => {
    const parser = new SseParser()
    const events = parser.push('event: ping\r\ndata: hi\r\n\r\n')
    expect(events.length).toBe(1)
    expect(events[0].event).toBe('ping')
    expect(events[0].data).toBe('hi')
  })

  test('skips comment lines', () => {
    const parser = new SseParser()
    const events = parser.push(': keepalive\ndata: x\n\n')
    expect(events.length).toBe(1)
    expect(events[0].data).toBe('x')
  })

  test('buffers across chunks', () => {
    const parser = new SseParser()
    expect(parser.push('data: par')).toEqual([])
    expect(parser.push('tial\n')).toEqual([])
    const events = parser.push('\n')
    expect(events.length).toBe(1)
    expect(events[0].data).toBe('partial')
  })

  test('captures id field', () => {
    const parser = new SseParser()
    const events = parser.push('id: 42\ndata: y\n\n')
    expect(events[0].id).toBe('42')
  })
})
