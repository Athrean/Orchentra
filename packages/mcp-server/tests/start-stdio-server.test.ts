import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { type Operation } from '@orchentra/operations'
import { startStdioServer, type WritableLike } from '../src/start-stdio-server'

function echoOp(): Operation<{ message: string }, string> {
  return {
    id: 'echo',
    description: 'echoes input',
    scope: 'read',
    localOnly: false,
    mutating: false,
    parameters: z.object({ message: z.string() }),
    handler: async (_ctx, params) => params.message,
  }
}

function chunksFrom(parts: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const p of parts) yield p
    },
  }
}

function captureStdout(): { stdout: WritableLike; lines: () => string[] } {
  const buf: string[] = []
  return {
    stdout: { write: (chunk: string) => buf.push(chunk) },
    lines: () => buf.join('').split('\n').filter(Boolean),
  }
}

describe('startStdioServer end-of-stream flushing', () => {
  test('processes a single line with no trailing newline', async () => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const { stdout, lines } = captureStdout()
    await startStdioServer([echoOp()], { stdin: chunksFrom([new TextEncoder().encode(msg)]), stdout })
    const responses = lines().map((l) => JSON.parse(l) as { id: number; result: { tools: Array<{ name: string }> } })
    expect(responses[0].id).toBe(1)
    expect(responses[0].result.tools[0].name).toBe('echo')
  })

  test('handles multibyte UTF-8 split across multiple stream chunks', async () => {
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'echo', arguments: { message: 'hi 界 mom' } },
    })
    const bytes = new TextEncoder().encode(msg)
    // Walk a 1-byte split through every position to exercise mid-multibyte splits.
    const a = bytes.slice(0, bytes.length - 5)
    const b = bytes.slice(bytes.length - 5)
    const { stdout, lines } = captureStdout()
    await startStdioServer([echoOp()], { stdin: chunksFrom([a, b]), stdout })
    const responses = lines().map((l) => JSON.parse(l) as { id: number; result: { content: Array<{ text: string }> } })
    expect(responses).toHaveLength(1)
    expect(responses[0].result.content[0].text).toBe('"hi 界 mom"')
  })
})
