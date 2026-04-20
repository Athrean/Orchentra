import { describe, expect, test } from 'bun:test'
import { SseParser } from '../src/sse'

describe('SseParser', () => {
  test('parses a single complete frame', () => {
    const parser = new SseParser()
    const frames = parser.push('event: message_start\ndata: {"type":"message_start"}\n\n')
    expect(frames).toHaveLength(1)
    expect(frames[0]).toEqual({
      event: 'message_start',
      data: '{"type":"message_start"}',
    })
  })

  test('buffers partial chunks across calls', () => {
    const parser = new SseParser()
    const first = parser.push('event: content_block_delta\ndata: {"type":"content_b')
    expect(first).toHaveLength(0)

    const second = parser.push('lock_delta"}\n\n')
    expect(second).toHaveLength(1)
    expect(second[0].data).toBe('{"type":"content_block_delta"}')
  })

  test('parses multiple frames from a single chunk', () => {
    const parser = new SseParser()
    const frames = parser.push('data: {"a":1}\n\ndata: {"b":2}\n\n')
    expect(frames).toHaveLength(2)
    expect(frames[0].data).toBe('{"a":1}')
    expect(frames[1].data).toBe('{"b":2}')
  })

  test('skips comment lines', () => {
    const parser = new SseParser()
    const frames = parser.push(': keepalive\ndata: {"ok":true}\n\n')
    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('{"ok":true}')
  })

  test('ignores ping events', () => {
    const parser = new SseParser()
    const frames = parser.push('event: ping\ndata: {}\n\n')
    expect(frames).toHaveLength(0)
  })

  test('ignores [DONE] sentinel', () => {
    const parser = new SseParser()
    const frames = parser.push('data: [DONE]\n\n')
    expect(frames).toHaveLength(0)
  })

  test('joins multi-line data fields', () => {
    const parser = new SseParser()
    const frames = parser.push('data: {"type":"delta",\ndata: "text":"hi"}\n\n')
    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('{"type":"delta",\n"text":"hi"}')
  })

  test('handles CRLF separators', () => {
    const parser = new SseParser()
    const frames = parser.push('data: {"x":1}\r\n\r\n')
    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('{"x":1}')
  })

  test('finish flushes remaining data', () => {
    const parser = new SseParser()
    parser.push('data: {"trailing":true}')
    const frames = parser.finish()
    expect(frames).toHaveLength(1)
    expect(frames[0].data).toBe('{"trailing":true}')
  })

  test('finish returns empty when buffer is empty', () => {
    const parser = new SseParser()
    parser.push('data: {"x":1}\n\n')
    expect(parser.finish()).toHaveLength(0)
  })
})
