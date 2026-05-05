import type { Operation } from '@orchentra/operations'
import { handleRpc, type HandleRpcDeps } from './handle-rpc'
import type { IncomingMessage, ServerInfo } from './protocol'

export interface StartStdioServerOptions {
  serverInfo?: ServerInfo
  /** Test seam — defaults to `process.stdin` / `process.stdout`. */
  stdin?: AsyncIterable<Uint8Array>
  stdout?: WritableLike
}

export interface WritableLike {
  write(chunk: string): unknown
}

const DEFAULT_INFO: ServerInfo = { name: 'orchentra-mcp', version: '0.1.0' }

/**
 * Serve the given operations over JSON-RPC on stdio. Resolves when stdin
 * closes — the typical lifecycle is: a parent MCP client spawns this process,
 * exchanges messages, then closes stdin to signal shutdown.
 *
 * Hard-coded `remote: true` context construction lives in `handleRpc`; this
 * function is just I/O wiring around it.
 */
export async function startStdioServer(operations: Operation[], opts: StartStdioServerOptions = {}): Promise<void> {
  const deps: HandleRpcDeps = {
    operations,
    serverInfo: opts.serverInfo ?? DEFAULT_INFO,
  }
  const stdin: AsyncIterable<Uint8Array> = opts.stdin ?? (process.stdin as unknown as AsyncIterable<Uint8Array>)
  const stdout: WritableLike = opts.stdout ?? (process.stdout as unknown as WritableLike)

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of stdin) {
    buffer += decoder.decode(chunk, { stream: true })
    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line.length > 0) {
        await processLine(line, deps, stdout)
      }
      idx = buffer.indexOf('\n')
    }
  }

  // Flush the decoder before processing the tail. A multibyte UTF-8 sequence
  // split across the final two chunks would otherwise be dropped, truncating
  // the last message in the buffer.
  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    await processLine(buffer.trim(), deps, stdout)
  }
}

async function processLine(line: string, deps: HandleRpcDeps, stdout: WritableLike): Promise<void> {
  let parsed: IncomingMessage | null = null
  try {
    parsed = JSON.parse(line) as IncomingMessage
  } catch {
    return
  }
  if (!parsed || typeof parsed.method !== 'string') return
  const response = await handleRpc(parsed, deps)
  if (response) {
    stdout.write(JSON.stringify(response) + '\n')
  }
}
